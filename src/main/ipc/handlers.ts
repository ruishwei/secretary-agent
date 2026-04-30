import { ipcMain, BrowserWindow } from "electron";
import { IPC } from "../../shared/ipc-channels";
import { Logger } from "../utils/logger";
import { APP_VERSION } from "../../shared/constants";
import type { AppSettings, AgentEvent, BrowserState, RecordingState } from "../../shared/types";
import { AgentLoop } from "../agent/agent-loop";
import { ToolExecutor } from "../agent/tool-executor";
import { BrowserManager } from "../browser/browser-manager";
import { BrowserStateProvider } from "../browser/browser-state-provider";
import { registerBrowserTools } from "../agent/tools/browser/register-browser-tools";
import { registerSkillTools } from "../agent/tools/skills/register-skill-tools";
import { registerMemoryTools } from "../agent/tools/memory/register-memory-tools";
import { SkillManager } from "../skills/skill-manager";
import { MemoryStore } from "../memory/memory-store";
import { getConfig } from "../utils/config";
import { loadSettings, saveSettings } from "../utils/settings-store";

const logger = new Logger("IPC");

let settings: AppSettings = loadSettings();
let agentRunning = false;
let agentLoop: AgentLoop | null = null;

import { OperationRecorder } from "../browser/operation-recorder";

// Module-level browser state (shared between IPC handlers and tools)
let browserManager: BrowserManager;
let browserStateProvider: BrowserStateProvider;
let operationRecorder: OperationRecorder;

function getMainWin(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

function sendAgentEvent(win: BrowserWindow | null, event: AgentEvent) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.AGENT_EVENT, event);
  }
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

async function initAgentLoop(): Promise<AgentLoop> {
  if (agentLoop) return agentLoop;

  // Create browser infrastructure
  if (!browserManager) {
    browserManager = new BrowserManager();

    // Wire main window
    const win = getMainWin();
    if (win) {
      browserManager.setMainWindow(win);
    }

    // Wire state push callback so tab navigation events reach the renderer
    browserManager.setStatePushCallback(pushTabState);

    // Wire popup callback: create a new tab + notify renderer
    browserManager.setPopupCallback((tabId, url, sourceTabId) => {
      browserManager.createTab(tabId, url);
      browserManager.setActiveTab(tabId);
      const win = getMainWin();
      if (win) {
        win.webContents.send(IPC.BROWSER_POPUP_OPEN, { tabId, url, sourceTabId });
        win.webContents.send(IPC.TAB_LIST_CHANGED, {
          tabs: browserManager.getAllTabs(),
          activeTabId: tabId,
        });
      }
    });
  }
  browserStateProvider = new BrowserStateProvider(browserManager);

  // Create tool executor (empty — tools registered after LLM client exists)
  const toolExecutor = new ToolExecutor();

  // Wire renderer callback on tool executor
  toolExecutor.setRendererCallback(getRendererSender());

  // Create AgentLoop (creates LLMClient internally)
  agentLoop = new AgentLoop(
    {
      llm: {
        provider: settings.llm.provider,
        apiKey: settings.llm.apiKey,
        model: settings.llm.model,
        maxTokens: settings.llm.maxTokens,
        baseUrl: settings.llm.baseUrl,
      },
    },
    browserStateProvider,
    toolExecutor,
  );

  // Ensure at least one tab exists for the agent
  if (browserManager.tabCount === 0) {
    browserManager.createTab("tab-initial");
  }

  // Now register browser tools with the LLM client from AgentLoop
  registerBrowserTools(toolExecutor, {
    browser: browserManager,
    llmClient: agentLoop.getLLMClient(),
    sendToRenderer: getRendererSender(),
  });

  // Initialize skill and memory systems
  const config = getConfig();
  const skillManager = new SkillManager(config.skillsPath);
  await skillManager.initialize();
  const memoryStore = new MemoryStore(config.memoryPath, config.sessionsPath);

  registerSkillTools(toolExecutor, skillManager);
  registerMemoryTools(toolExecutor, memoryStore);

  agentLoop.setSkillManager(skillManager);
  agentLoop.setMemoryStore(memoryStore);

  // Initialize operation recorder (decoupled — skill save via callback)
  if (!operationRecorder) {
    operationRecorder = new OperationRecorder();
    operationRecorder.setSkillCallback(async (name, category, content) => {
      await skillManager.create(category, name, content);
    });
  }

  await agentLoop.initialize();
  logger.info("Agent loop initialized with skills, memory, and recorder");
  return agentLoop;
}

/** Initialize browser and create default tab (called on first message or explicitly). */
async function initBrowser(): Promise<void> {
  if (!browserManager) {
    browserManager = new BrowserManager();
    const win = getMainWin();
    if (win) {
      browserManager.setMainWindow(win);
    }
    browserManager.setStatePushCallback(pushTabState);
    browserManager.setPopupCallback((tabId, url, sourceTabId) => {
      browserManager.createTab(tabId, url);
      browserManager.setActiveTab(tabId);
      const win = getMainWin();
      if (win) {
        win.webContents.send(IPC.BROWSER_POPUP_OPEN, { tabId, url, sourceTabId });
        win.webContents.send(IPC.TAB_LIST_CHANGED, {
          tabs: browserManager.getAllTabs(),
          activeTabId: tabId,
        });
      }
    });
    await browserManager.initialize();
  }
}

export function registerIpcHandlers(): void {
  // ===== Chat =====

  ipcMain.handle(IPC.SEND_MESSAGE, async (_event, req: { text: string; attachments?: unknown[] }) => {
    const win = getMainWin();
    logger.info(`Message received: "${req.text.substring(0, 100)}"`);

    if (agentRunning) {
      return {
        messageId: `msg-${Date.now()}`,
        status: "rejected" as const,
        reason: "Agent is already processing a request.",
      };
    }

    try {
      // Ensure browser is initialized before first agent message
      await initBrowser();

      const loop = await initAgentLoop();

      if (!settings.llm.apiKey) {
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

      agentRunning = true;

      // Run agent loop asynchronously, streaming events to renderer
      (async () => {
        try {
          for await (const event of loop.run(req.text)) {
            sendAgentEvent(win, event);

            if (event.type === "done" || event.type === "error") {
              agentRunning = false;
            }
          }
        } catch (err: any) {
          logger.error(`Agent loop error: ${err.message}`);
          sendAgentEvent(win, {
            type: "error",
            message: `Agent error: ${err.message}`,
            recoverable: false,
          });
          agentRunning = false;
        }
      })();

      return {
        messageId: `msg-${Date.now()}`,
        status: "queued" as const,
      };
    } catch (err: any) {
      logger.error(`Failed to start agent: ${err.message}`);
      return {
        messageId: `msg-${Date.now()}`,
        status: "rejected" as const,
        reason: err.message,
      };
    }
  });

  ipcMain.handle(IPC.ABORT_AGENT, async () => {
    logger.info("Agent abort requested");
    if (agentLoop) {
      agentLoop.abort();
    }
    agentRunning = false;
  });

  // ===== Browser Navigation =====

  ipcMain.handle(IPC.BROWSER_NAVIGATE_TO, async (_event, url: string, tabId?: string) => {
    logger.info(`Navigate to: ${url}${tabId ? ` (tab: ${tabId})` : ""}`);
    if (!browserManager) await initBrowser();
    const session = tabId ? browserManager.getSession(tabId) : browserManager.getActiveSession();
    if (session) {
      session.loadURL(url);
    }
  });

  ipcMain.handle(IPC.BROWSER_GO_BACK, async (_event, tabId?: string) => {
    if (!browserManager) await initBrowser();
    const session = tabId ? browserManager.getSession(tabId) : browserManager.getActiveSession();
    session?.goBack();
  });

  ipcMain.handle(IPC.BROWSER_GO_FORWARD, async (_event, tabId?: string) => {
    if (!browserManager) await initBrowser();
    const session = tabId ? browserManager.getSession(tabId) : browserManager.getActiveSession();
    session?.goForward();
  });

  ipcMain.handle(IPC.BROWSER_REFRESH, async (_event, tabId?: string) => {
    if (!browserManager) await initBrowser();
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
    if (!browserManager) await initBrowser();
    const session = tabId ? browserManager.getSession(tabId) : browserManager.getActiveSession();
    session?.stop();
  });

  ipcMain.handle(IPC.BROWSER_LAYOUT, async (_event, bounds: { x: number; y: number; width: number; height: number }) => {
    if (!browserManager) await initBrowser();
    browserManager.setLayoutBounds(bounds);
  });

  // ===== Tab Management =====

  ipcMain.handle(IPC.TAB_CREATE, async (_event, url?: string) => {
    logger.info(`Tab create requested${url ? ` for ${url}` : ""}`);
    if (!browserManager) {
      await initBrowser();
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
        (async () => {
          try {
            for await (const event of agentLoop!.resumeAfterReview(reviewId, approved, modifications)) {
              sendAgentEvent(win, event);
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

    // Update agent loop with new LLM config
    if (agentLoop && newSettings.llm) {
      agentLoop.updateLLMConfig({
        provider: settings.llm.provider,
        apiKey: settings.llm.apiKey,
        model: settings.llm.model,
        maxTokens: settings.llm.maxTokens,
        baseUrl: settings.llm.baseUrl,
      });
    }

    logger.info("Settings updated and saved");
  });

  // ===== Operation Recording =====

  ipcMain.handle(IPC.RECORDING_START, async () => {
    logger.info("Recording start requested");
    if (!browserManager) await initBrowser();

    const session = browserManager.getActiveSession();
    if (!session) {
      return { success: false, error: "No active tab" };
    }

    if (!operationRecorder) {
      operationRecorder = new OperationRecorder();
    }

    try {
      await operationRecorder.start(session.tabId, session.webContents);
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
      const recordingSession = await operationRecorder.stop(session.webContents);

      pushRecordingState({ isRecording: false, actionCount: 0 });

      if (recordingSession && recordingSession.actions.length > 0) {
        // Auto-save as a skill from the recorded actions
        const startUrl = recordingSession.startUrl;
        const domain = (() => {
          try { return new URL(startUrl).hostname.replace(/^www\./, "").replace(/\./g, "-"); } catch { return "workflow"; }
        })();
        const name = `Recorded: ${domain} workflow`;
        const result = await operationRecorder.saveAsSkill(
          name,
          "recorded",
          recordingSession,
        );

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

  // ===== System =====

  ipcMain.handle(IPC.GET_APP_VERSION, async () => {
    return APP_VERSION;
  });

  logger.info("IPC handlers registered");
}
