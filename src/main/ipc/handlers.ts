import { ipcMain, BrowserWindow, shell } from "electron";
import { IPC } from "../../shared/ipc-channels";
import { Logger } from "../utils/logger";
import { APP_VERSION } from "../../shared/constants";
import type { AppSettings, AgentEvent, BrowserState, RecordingState } from "../../shared/types";
import { AgentLoop } from "../agent/agent-loop";
import { ToolExecutor } from "../agent/tool-executor";
import { BrowserManager } from "../browser/browser-manager";
import { PluginRegistry } from "../core/plugin-registry";
import { createBrowserPlugin, type BrowserPluginExports } from "../../plugins/browser/main/index";
import { registerSkillTools } from "../agent/tools/skills/register-skill-tools";
import { registerMemoryTools } from "../agent/tools/memory/register-memory-tools";
import { registerTaskTools } from "../agent/tools/tasks/register-task-tools";
import { SkillManager } from "../skills/skill-manager";
import { SkillHubClient } from "../skills/skill-hub-client";
import { MemoryStore } from "../memory/memory-store";
import { PasswordStore } from "../password-manager/password-store";
import { ConsciousnessStore } from "../consciousness/consciousness-store";
import { TaskScheduler } from "../task/task-scheduler";
import { SelfEvolution } from "../learning/self-evolution";
import { PrivacyGuard } from "../security/privacy-guard";
import { getConfig } from "../utils/config";
import { loadSettings, saveSettings } from "../utils/settings-store";

// Tool imports
import { executeReflect } from "../agent/tools/learning/reflect";

const logger = new Logger("IPC");

let settings: AppSettings = loadSettings();
let agentRunning = false;
let agentLoop: AgentLoop | null = null;
let taskScheduler = new TaskScheduler();
let selfEvolution = new SelfEvolution();
let privacyGuard = new PrivacyGuard();

import { OperationRecorder } from "../browser/operation-recorder";

// Module-level state (sourced from plugins, shared between IPC handlers and tools)
let pluginRegistry: PluginRegistry;
let browserManager: BrowserManager;
let operationRecorder: OperationRecorder;
let consciousnessStore: ConsciousnessStore;
let passwordStore: PasswordStore;
let _skillManager: SkillManager | null = null;
let _memoryStore: MemoryStore | null = null;

function ensureConsciousnessStore(): ConsciousnessStore {
  if (!consciousnessStore) {
    consciousnessStore = new ConsciousnessStore(getConfig().userDataPath);
  }
  return consciousnessStore;
}

function ensureSkillManager(): SkillManager {
  if (!_skillManager) {
    _skillManager = new SkillManager(getConfig().skillsPath);
  }
  return _skillManager;
}

function ensureMemoryStore(): MemoryStore {
  if (!_memoryStore) {
    _memoryStore = new MemoryStore(getConfig().memoryPath, getConfig().sessionsPath);
  }
  return _memoryStore;
}

function ensureHubClient(): SkillHubClient {
  return new SkillHubClient();
}

function getActiveLlmConfig(): {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
  maxTokens: number;
  baseUrl?: string;
} | null {
  const active = settings.llmConfigs?.find((c) => c.id === settings.activeLlmConfigId);
  if (!active) return null;
  return {
    provider: active.provider,
    apiKey: active.apiKey,
    model: active.model,
    maxTokens: active.maxTokens,
    baseUrl: active.baseUrl,
  };
}

function getMainWin(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

function sendAgentEvent(win: BrowserWindow | null, event: AgentEvent & { taskId?: string }) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.AGENT_EVENT, event);
  }
}

let currentTaskId = "";

function pushConsciousnessEvent(event: AgentEvent) {
  const store = ensureConsciousnessStore();
  store.recordEvent(currentTaskId, event);
  const win = getMainWin();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.CONSCIOUSNESS_EVENT, { taskId: currentTaskId, ...event });
  }
}

function pushTaskSnapshot() {
  const win = getMainWin();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.TASK_SNAPSHOT_CHANGED, taskScheduler.getSnapshot());
  }
}

function startTaskLoop(taskId: string, loop: AgentLoop, userMessage: string, attachments?: unknown[]) {
  const win = getMainWin();
  currentTaskId = taskId;
  agentRunning = true;

  const images = attachments
    ?.filter((a: any) => a.dataUrl?.startsWith("data:image/"))
    .map((a: any) => a.dataUrl);

  // Enrich the message with context about recently completed tasks
  const taskContext = taskScheduler.buildTaskContext();
  const enrichedMessage = taskContext
    ? `${userMessage}\n\n[System: Task context]\n${taskContext}`
    : userMessage;

  (async () => {
    try {
      for await (const event of loop.run(enrichedMessage, images)) {
        sendAgentEvent(win, { ...event, taskId });
        pushConsciousnessEvent({ ...event, taskId } as any);

        if (event.type === "done") {
          agentRunning = false;
          taskScheduler.completeTask(taskId);
          taskScheduler.setSummary(taskId, event.summary);
        } else if (event.type === "error" && !event.recoverable) {
          agentRunning = false;
          taskScheduler.cancelTask(taskId);
        }
      }
    } catch (err: any) {
      logger.error(`Agent loop error for task ${taskId}: ${err.message}`);
      sendAgentEvent(win, {
        type: "error",
        message: `Agent error: ${err.message}`,
        recoverable: false,
        taskId,
      });
      pushConsciousnessEvent({ type: "error", message: err.message, taskId } as any);
      agentRunning = false;
      taskScheduler.cancelTask(taskId);
    } finally {
      ensureConsciousnessStore().saveToDisk(taskId);
      pushTaskSnapshot();

      // Notify self-evolution of task completion
      selfEvolution.onTaskCompleted();
      selfEvolution.autoReflect().catch((err) => {
        logger.error(`Auto-reflection error: ${err.message}`);
      });

      // Auto-start next pending task
      const nextTask = taskScheduler.getNextTask();
      if (nextTask) {
        taskScheduler.activate(nextTask.id);
        startTaskLoop(nextTask.id, loop, nextTask.title);
        pushTaskSnapshot();
      }
    }
  })();
}

function getRendererSender(): (channel: string, data: unknown) => void {
  return (channel, data) => {
    const win = getMainWin();
    if (win) {
      win.webContents.send(channel as any, data);
    }
  };
}

/** Push tab state to renderer — wired as BrowserManager's state callback. */
function pushTabState(state: BrowserState) {
  const win = getMainWin();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.TAB_STATE_CHANGED, state);
  }
}

/** Push recording state to renderer. */
function pushRecordingState(state: RecordingState) {
  const win = getMainWin();
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.RECORDING_STATE_CHANGED, state);
  }
}

/** Initialize the plugin system: register and enable all plugins. */
async function initPluginSystem(): Promise<void> {
  if (pluginRegistry) return;

  pluginRegistry = new PluginRegistry();

  // Register browser plugin
  await pluginRegistry.register(createBrowserPlugin(), {
    getLLMClient() {
      if (!agentLoop) throw new Error("Agent loop not initialized");
      return agentLoop.getLLMClient();
    },
    sendToRenderer(channel, data) {
      getRendererSender()(channel, data);
    },
    getSettings() {
      return settings;
    },
    getDataPath() {
      return getConfig().userDataPath;
    },
  });

  // Enable browser plugin (initializes BrowserManager, creates default tab)
  await pluginRegistry.enable("browser");

  // Extract browser services from plugin exports
  const bp = pluginRegistry.getPlugin("browser");
  const exports = bp?.exports as BrowserPluginExports | undefined;
  if (exports) {
    browserManager = exports.browserManager;
  }
}

async function initAgentLoop(): Promise<AgentLoop> {
  if (agentLoop) return agentLoop;

  // Initialize plugin system (registers + enables browser plugin)
  await initPluginSystem();

  // Create tool executor (empty — tools registered after LLM client exists)
  const toolExecutor = new ToolExecutor();
  toolExecutor.setRendererCallback(getRendererSender());

  // Create AgentLoop (creates LLMClient internally)
  const activeConfig = getActiveLlmConfig();
  if (!activeConfig) {
    throw new Error("No active LLM configuration. Please configure a model in Settings.");
  }

  // Use the primary state provider from the plugin registry
  const stateProviders = pluginRegistry.getStateProviders();
  if (stateProviders.length === 0) {
    throw new Error("No state provider available. Ensure the browser plugin is enabled.");
  }
  agentLoop = new AgentLoop({ llm: activeConfig }, stateProviders[0], toolExecutor);

  // Register all plugin tools through the registry
  pluginRegistry.registerAllTools(toolExecutor, {
    llmClient: agentLoop.getLLMClient(),
    sendToRenderer: getRendererSender(),
    getSettings: () => settings,
  });

  // Initialize skill and memory systems (shared singletons, also used by settings IPC)
  const skillManager = ensureSkillManager();
  await skillManager.initialize();
  const memoryStore = ensureMemoryStore();

  registerSkillTools(toolExecutor, skillManager);
  registerMemoryTools(toolExecutor, memoryStore);
  registerTaskTools(toolExecutor, taskScheduler);

  // Initialize self-evolution and register reflect tool
  selfEvolution.setLLMClient(agentLoop.getLLMClient());
  selfEvolution.setSkillManager(skillManager);
  selfEvolution.setMemoryStore(memoryStore);
  toolExecutor.register(executeReflect(selfEvolution, memoryStore, skillManager));

  agentLoop.setSkillManager(skillManager);
  agentLoop.setMemoryStore(memoryStore);
  agentLoop.setPrivacyGuard(privacyGuard);

  // Initialize operation recorder (decoupled — skill save + LLM synthesis via callbacks)
  if (!operationRecorder) {
    operationRecorder = new OperationRecorder();
    operationRecorder.setSkillSaveCallback(async (name, category, content) => {
      await skillManager.create(category, name, content);
    });
    operationRecorder.setLLMSynthesisCallback(async (prompt: string) => {
      const llmClient = agentLoop!.getLLMClient();
      const response = await llmClient.simpleQuery(
        "You are a technical writer creating reusable browser automation skills. Produce only the requested SKILL.md content, no preamble.",
        prompt,
      );
      return response;
    });
  }

  logger.info("Agent loop created via plugin system");
  return agentLoop;
}

export function registerIpcHandlers(): void {
  // ===== Chat =====

  ipcMain.handle(IPC.SEND_MESSAGE, async (_event, req: { text: string; attachments?: unknown[] }) => {
    const win = getMainWin();
    logger.info(`Message received: "${req.text.substring(0, 100)}"`);

    try {
      await initPluginSystem();
      const loop = await initAgentLoop();

      const activeCfg = getActiveLlmConfig();
      if (!activeCfg || !activeCfg.apiKey) {
        sendAgentEvent(win, {
          type: "error",
          message: "No API key configured. Please set your LLM API key in Settings.",
          recoverable: true,
        });
        return {
          messageId: `msg-${Date.now()}`,
          status: "rejected" as const,
          reason: "No API key configured.",
        };
      }

      // Create a task and decide: start now or queue
      const task = taskScheduler.createTask({
        title: req.text.slice(0, 80),
        priority: 5,
      });

      const activeTask = taskScheduler.getActiveTask();
      const shouldStartNow = !activeTask;

      if (shouldStartNow) {
        taskScheduler.activate(task.id);
        startTaskLoop(task.id, loop, req.text, req.attachments);
      }
      // else: queued as pending; will auto-start when current task completes

      pushTaskSnapshot();

      return {
        messageId: task.id,
        status: "queued" as const,
      };
    } catch (err: any) {
      logger.error(`Failed to handle message: ${err.message}`);
      return {
        messageId: `msg-${Date.now()}`,
        status: "rejected" as const,
        reason: err.message,
      };
    }
  });

  ipcMain.handle(IPC.ABORT_AGENT, async () => {
    logger.info("Agent abort requested");
    const activeTaskId = taskScheduler.getActiveTaskId();
    if (activeTaskId) {
      taskScheduler.cancelTask(activeTaskId);
    }
    if (agentLoop) {
      agentLoop.abort();
    }
    agentRunning = false;
    pushTaskSnapshot();
  });

  // ===== Browser Navigation =====

  ipcMain.handle(IPC.BROWSER_NAVIGATE_TO, async (_event, url: string, tabId?: string) => {
    logger.info(`Navigate to: ${url}${tabId ? ` (tab: ${tabId})` : ""}`);
    if (!browserManager) await initPluginSystem();
    const session = tabId ? browserManager.getSession(tabId) : browserManager.getActiveSession();
    if (session) {
      session.loadURL(url);
    }
  });

  ipcMain.handle(IPC.BROWSER_GO_BACK, async (_event, tabId?: string) => {
    if (!browserManager) await initPluginSystem();
    const session = tabId ? browserManager.getSession(tabId) : browserManager.getActiveSession();
    session?.goBack();
  });

  ipcMain.handle(IPC.BROWSER_GO_FORWARD, async (_event, tabId?: string) => {
    if (!browserManager) await initPluginSystem();
    const session = tabId ? browserManager.getSession(tabId) : browserManager.getActiveSession();
    session?.goForward();
  });

  ipcMain.handle(IPC.BROWSER_REFRESH, async (_event, tabId?: string) => {
    if (!browserManager) await initPluginSystem();
    const session = tabId ? browserManager.getSession(tabId) : browserManager.getActiveSession();
    if (session) {
      if (session.isLoading) {
        session.stop();
      } else {
        session.reload();
      }
    }
  });

  ipcMain.handle(IPC.BROWSER_STOP, async (_event, tabId?: string) => {
    if (!browserManager) await initPluginSystem();
    const session = tabId ? browserManager.getSession(tabId) : browserManager.getActiveSession();
    session?.stop();
  });

  ipcMain.handle(IPC.BROWSER_LAYOUT, async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    if (!browserManager) await initPluginSystem();
    browserManager.setLayoutBounds(bounds);
  });

  ipcMain.handle(IPC.BROWSER_SET_VISIBLE, async (_event, visible: boolean) => {
    if (!browserManager) await initPluginSystem();
    browserManager.setVisible(visible);
  });

  // ===== Tab Management =====

  ipcMain.handle(IPC.TAB_CREATE, async (_event, url?: string) => {
    logger.info(`Tab create requested${url ? ` for ${url}` : ""}`);
    if (!browserManager) {
      await initPluginSystem();
    }
    const session = browserManager.createTab(undefined, url);
    // Push tab list update to renderer
    const win = getMainWin();
    if (win) {
      win.webContents.send(IPC.TAB_LIST_CHANGED, {
        tabs: browserManager.getAllTabs(),
        activeTabId: session.tabId,
      });
      // Also push initial state for the new tab
      pushTabState({
        tabId: session.tabId,
        url: session.url,
        title: session.title,
        favicon: session.favicon,
        isLoading: session.isLoading,
        canGoBack: session.canGoBack,
        canGoForward: session.canGoForward,
      });
    }
  });

  ipcMain.handle(IPC.TAB_CLOSE, async (_event, tabId: string) => {
    logger.info(`Tab close requested: ${tabId}`);
    if (browserManager) {
      browserManager.closeTab(tabId);
      const win = getMainWin();
      if (win) {
        win.webContents.send(IPC.TAB_LIST_CHANGED, {
          tabs: browserManager.getAllTabs(),
          activeTabId: browserManager.getActiveSession()?.tabId || null,
        });
      }
    }
  });

  ipcMain.handle(IPC.TAB_SWITCH, async (_event, tabId: string) => {
    logger.info(`Tab switch requested: ${tabId}`);
    if (browserManager) {
      browserManager.setActiveTab(tabId);
      const session = browserManager.getActiveSession();
      if (session) {
        pushTabState({
          tabId: session.tabId,
          url: session.url,
          title: session.title,
          favicon: session.favicon,
          isLoading: session.isLoading,
          canGoBack: session.canGoBack,
          canGoForward: session.canGoForward,
        });
      }
    }
  });

  // ===== Session Control (review) =====

  ipcMain.handle(
    IPC.REVIEW_RESPONSE,
    async (_event, reviewId: string, response: string, modifications?: string) => {
      logger.info(`Review ${reviewId}: ${response}${modifications ? ` (modifications: ${modifications})` : ""}`);

      if (agentLoop && response !== "rejected") {
        const approved = response === "approved" || response === "modified";
        agentRunning = true;
        const win = getMainWin();
        const reviewTaskId = currentTaskId;
        (async () => {
          try {
            for await (const event of agentLoop!.resumeAfterReview(reviewId, approved, modifications)) {
              sendAgentEvent(win, { ...event, taskId: reviewTaskId });
              if (event.type === "done" || event.type === "error") {
                agentRunning = false;
              }
            }
          } catch (err: any) {
            logger.error(`Review resume error: ${err.message}`);
            sendAgentEvent(win, {
              type: "error",
              message: `Review resume error: ${err.message}`,
              recoverable: false,
              taskId: reviewTaskId,
            });
            agentRunning = false;
          }
        })();
      }
    }
  );

  // ===== Voice =====

  ipcMain.handle(IPC.VOICE_TRANSCRIBE, async () => {
    logger.info("Voice transcription requested");
    return {
      text: "",
      confidence: 0,
      provider: "webspeech" as const,
    };
  });

  // ===== Settings =====

  ipcMain.handle(IPC.GET_SETTINGS, async () => {
    return settings;
  });

  ipcMain.handle(IPC.UPDATE_SETTINGS, async (_event, newSettings: Partial<AppSettings>) => {
    settings = { ...settings, ...newSettings };

    // Persist to disk
    saveSettings(settings);

    // Update agent loop with new LLM config if configs or active changed
    if (agentLoop && (newSettings.llmConfigs || newSettings.activeLlmConfigId)) {
      const activeCfg = getActiveLlmConfig();
      if (activeCfg) {
        agentLoop.updateLLMConfig(activeCfg);
      }
    }

    // Update browser screenshot quality if changed
    if (browserManager && newSettings.browser?.screenshotQuality !== undefined) {
      browserManager.setScreenshotQuality(newSettings.browser.screenshotQuality);
    }

    logger.info("Settings updated and saved");
  });

  // ===== Operation Recording =====

  ipcMain.handle(IPC.RECORDING_START, async () => {
    logger.info("Recording start requested");
    if (!browserManager) await initPluginSystem();

    const session = browserManager.getActiveSession();
    if (!session) {
      return { success: false, error: "No active tab" };
    }

    if (!operationRecorder) {
      operationRecorder = new OperationRecorder();
    }

    try {
      await operationRecorder.start(session);
      pushRecordingState({
        isRecording: true,
        startedAt: Date.now(),
        actionCount: 0,
        tabId: session.tabId,
      });
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.RECORDING_STOP, async () => {
    logger.info("Recording stop requested");
    if (!operationRecorder || !operationRecorder.isRecording) {
      return { success: false, error: "Not recording" };
    }

    const session = browserManager?.getActiveSession();
    if (!session) {
      return { success: false, error: "No active tab" };
    }

    try {
      const recordingSession = await operationRecorder.stop(session);
      pushRecordingState({ isRecording: false, actionCount: 0 });

      if (recordingSession && recordingSession.actions.length > 0) {
        // Synthesize a polished skill via LLM
        const result = await operationRecorder.synthesizeSkill(recordingSession);

        return {
          success: result.success,
          actionCount: recordingSession.actions.length,
          skillName: result.success ? result.skillName : undefined,
          error: result.error,
        };
      }

      return { success: true, actionCount: 0 };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle(IPC.RECORDING_SAVE_SKILL, async () => {
    if (!operationRecorder) {
      return { success: false, error: "No recorder instance" };
    }
    return operationRecorder.commitPendingSkill();
  });

  ipcMain.handle(IPC.RECORDING_DISCARD_SKILL, async () => {
    operationRecorder?.discardPendingSkill();
    return { success: true };
  });

  // ===== Password Manager =====

  ipcMain.handle(IPC.PASSWORD_GET_ALL, async () => {
    if (!passwordStore) passwordStore = new PasswordStore();
    return passwordStore.getAll();
  });

  ipcMain.handle(IPC.PASSWORD_SAVE, async (_event, input: { domain: string; username: string; password: string }, id?: string) => {
    if (!passwordStore) passwordStore = new PasswordStore();
    return passwordStore.save(input, id);
  });

  ipcMain.handle(IPC.PASSWORD_DELETE, async (_event, entryId: string) => {
    if (!passwordStore) passwordStore = new PasswordStore();
    return passwordStore.delete(entryId);
  });

  // ===== Memory Management =====

  ipcMain.handle(IPC.MEMORY_GET_CONTENT, async () => {
    const store = ensureMemoryStore();
    return {
      memory: store.getMemorySnapshot(),
      user: store.getUserProfile(),
    };
  });

  ipcMain.handle(IPC.MEMORY_SET_CONTENT, async (_event, target: "memory" | "user", content: string) => {
    const store = ensureMemoryStore();
    // Replace full content by reading current, finding old, and replacing
    if (target === "memory") {
      const current = store.getMemorySnapshot();
      if (current) {
        return store.replace("deep", current, content);
      }
      return store.add("deep", content);
    } else {
      const current = store.getUserProfile();
      if (current) {
        return store.replace("user", current, content);
      }
      return store.add("user", content);
    }
  });

  // ===== Skills Management =====

  ipcMain.handle(IPC.SKILLS_LIST_ALL, async () => {
    const mgr = ensureSkillManager();
    await mgr.initialize();
    const skills = mgr.list();
    const bundledPath = (mgr as any).bundledSkillsPath || "";
    return skills.map((s) => ({
      name: s.name,
      category: s.category,
      description: s.description,
      version: s.version,
      isBundled: s.path.startsWith(bundledPath),
    }));
  });

  ipcMain.handle(IPC.SKILLS_GET_CONTENT, async (_event, name: string) => {
    const mgr = ensureSkillManager();
    await mgr.initialize();
    return mgr.load(name);
  });

  ipcMain.handle(IPC.SKILLS_DELETE, async (_event, name: string) => {
    const mgr = ensureSkillManager();
    await mgr.initialize();
    return mgr.delete(name);
  });

  // ===== Skill Hub (ClawHub) =====

  ipcMain.handle(IPC.SKILL_HUB_SEARCH, async (_event, query: string, limit?: number, offset?: number) => {
    try {
      const hub = ensureHubClient();
      return await hub.search(query, limit, offset);
    } catch (err: any) {
      logger.error(`Hub search error: ${err.message}`);
      return { results: [], error: err.message };
    }
  });

  ipcMain.handle(IPC.SKILL_HUB_GET_SKILL, async (_event, slug: string) => {
    try {
      const hub = ensureHubClient();
      return await hub.getSkill(slug);
    } catch (err: any) {
      logger.error(`Hub getSkill error: ${err.message}`);
      return { error: err.message };
    }
  });

  ipcMain.handle(IPC.SKILL_HUB_INSTALL, async (_event, slug: string) => {
    try {
      const hub = ensureHubClient();
      const skillsPath = getConfig().skillsPath;
      const result = await hub.downloadAndInstall(slug, skillsPath);
      if (result.success) {
        const mgr = ensureSkillManager();
        await mgr.initialize();
      }
      return result;
    } catch (err: any) {
      logger.error(`Hub install error: ${err.message}`);
      return { success: false, error: err.message };
    }
  });

  // ===== Workspace =====

  ipcMain.handle(IPC.WORKSPACE_GET_PATHS, async () => {
    const config = getConfig();
    return {
      skillsPath: config.skillsPath,
      memoryPath: config.memoryPath,
      sessionsPath: config.sessionsPath,
    };
  });

  ipcMain.handle(IPC.WORKSPACE_OPEN_FOLDER, async (_event, folderPath: string) => {
    await shell.openPath(folderPath);
  });

  // ===== Consciousness Stream =====

  ipcMain.handle(IPC.CONSCIOUSNESS_GET_STREAM, async (_event, taskId: string) => {
    const store = ensureConsciousnessStore();
    // Try in-memory first, then disk
    const active = store.getStream(taskId);
    if (active.length > 0) return active;
    return store.loadFromDisk(taskId);
  });

  ipcMain.handle(IPC.CONSCIOUSNESS_GET_ACTIVE, async () => {
    return ensureConsciousnessStore().getActiveTaskIds();
  });

  ipcMain.handle(IPC.CONSCIOUSNESS_GET_RECENT, async (_event, limit?: number) => {
    return ensureConsciousnessStore().getRecentEntries(limit || 50);
  });

  ipcMain.handle(IPC.CONSCIOUSNESS_DELETE_STREAM, async (_event, taskId: string) => {
    ensureConsciousnessStore().deleteStream(taskId);
  });

  // ===== Task Management =====

  ipcMain.handle(IPC.TASK_LIST, async () => {
    return taskScheduler.getAllTasks();
  });

  ipcMain.handle(IPC.TASK_GET_SNAPSHOT, async () => {
    return taskScheduler.getSnapshot();
  });

  ipcMain.handle(IPC.TASK_CREATE, async (_event, input: { title: string; priority?: number; tabId?: string }) => {
    const task = taskScheduler.createTask(input);
    pushTaskSnapshot();
    return task;
  });

  ipcMain.handle(IPC.TASK_CANCEL, async (_event, taskId: string) => {
    const activeId = taskScheduler.getActiveTaskId();
    if (taskId === activeId && agentLoop) {
      agentLoop.abort();
      agentRunning = false;
    }
    const ok = taskScheduler.cancelTask(taskId);
    pushTaskSnapshot();
    return ok;
  });

  ipcMain.handle(IPC.TASK_SWITCH, async (_event, taskId: string) => {
    const task = taskScheduler.getTask(taskId);
    if (!task || task.status === "completed" || task.status === "cancelled") {
      return false;
    }

    // Abort current task if running
    const activeId = taskScheduler.getActiveTaskId();
    if (activeId && activeId !== taskId && agentLoop) {
      agentLoop.abort();
      agentRunning = false;
      // Mark previous task as blocked (was interrupted)
      taskScheduler.blockTask(activeId);
    }

    taskScheduler.activate(taskId);
    pushTaskSnapshot();

    // Start the task loop for the newly activated task
    if (task.status === "active") {
      const loop = agentLoop;
      if (loop) {
        startTaskLoop(taskId, loop, task.title);
      }
    }

    return true;
  });

  ipcMain.handle(IPC.TASK_SET_PRIORITY, async (_event, taskId: string, priority: number) => {
    const ok = taskScheduler.setPriority(taskId, priority);
    if (ok) pushTaskSnapshot();
    return ok;
  });

  // ===== Window / Floating Mode =====

  let floatingMode = false;
  let savedBounds: { x: number; y: number; width: number; height: number } | null = null;

  ipcMain.handle(IPC.FLOATING_TOGGLE, async () => {
    const win = getMainWin();
    if (!win) return false;

    floatingMode = !floatingMode;

    if (floatingMode) {
      savedBounds = win.getBounds();
      const { screen } = require("electron");
      const primaryDisplay = screen.getPrimaryDisplay();
      const { width: screenWidth } = primaryDisplay.workAreaSize;

      // Position as a small floating bar at top-center of screen
      const floatW = 420;
      const floatH = 56;
      win.setBounds({
        x: Math.round((screenWidth - floatW) / 2),
        y: 4,
        width: floatW,
        height: floatH,
      });
      win.setAlwaysOnTop(true, "floating");
      win.setResizable(false);
      win.setMinimizable(false);
      win.setSkipTaskbar(false);
      // Hide browser — agent uses background browser or system browser
      if (browserManager) {
        browserManager.setVisible(false);
      }
    } else {
      win.setAlwaysOnTop(false);
      win.setResizable(true);
      win.setMinimizable(true);
      if (savedBounds) {
        win.setBounds(savedBounds);
        savedBounds = null;
      } else {
        win.setBounds({ x: 100, y: 100, width: 1400, height: 900 });
      }
      if (browserManager) {
        browserManager.setVisible(true);
      }
    }

    // Notify renderer
    win.webContents.send(IPC.FLOATING_STATE_CHANGED, floatingMode);

    return floatingMode;
  });

  // ===== System =====

  ipcMain.handle(IPC.GET_APP_VERSION, async () => {
    return APP_VERSION;
  });

  logger.info("IPC handlers registered");
}
