import { ipcMain, BrowserWindow, webContents } from "electron";
import { IPC } from "../../shared/ipc-channels";
import { Logger } from "../utils/logger";
import { APP_VERSION } from "../../shared/constants";
import type { AppSettings, AgentEvent } from "../../shared/types";
import { AgentLoop } from "../agent/agent-loop";
import { loadSettings, saveSettings } from "../utils/settings-store";

const logger = new Logger("IPC");

let settings: AppSettings = loadSettings();
let agentRunning = false;
let agentLoop: AgentLoop | null = null;

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.length > 0 ? windows[0] : null;
}

function sendAgentEvent(win: BrowserWindow | null, event: AgentEvent) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.AGENT_EVENT, event);
  }
}

async function initAgentLoop(): Promise<AgentLoop> {
  if (agentLoop) return agentLoop;

  agentLoop = new AgentLoop({
    llm: {
      provider: settings.llm.provider,
      apiKey: settings.llm.apiKey,
      model: settings.llm.model,
      maxTokens: settings.llm.maxTokens,
      baseUrl: settings.llm.baseUrl,
    },
  });

  await agentLoop.initialize();
  logger.info("Agent loop initialized");
  return agentLoop;
}

export function registerIpcHandlers(): void {
  // ===== Chat =====

  ipcMain.handle(IPC.SEND_MESSAGE, async (event, req: { text: string; attachments?: unknown[] }) => {
    const win = getMainWindow();
    logger.info(`Message received: "${req.text.substring(0, 100)}"`);

    if (agentRunning) {
      return {
        messageId: `msg-${Date.now()}`,
        status: "rejected" as const,
        reason: "Agent is already processing a request.",
      };
    }

    try {
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

            if (event.type === "review-required") {
              // reviewId is passed back via REVIEW_RESPONSE handler
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

  // ===== Browser =====

  ipcMain.handle(IPC.BROWSER_ATTACH_WEBVIEW, async (_event, payload: { tabId: string; webContentsId: number }) => {
    logger.info(`Renderer reports webview webContents ${payload.webContentsId} for tab ${payload.tabId}`);
    try {
      if (!agentLoop) {
        agentLoop = new AgentLoop({
          llm: {
            provider: settings.llm.provider,
            apiKey: settings.llm.apiKey,
            model: settings.llm.model,
            maxTokens: settings.llm.maxTokens,
            baseUrl: settings.llm.baseUrl,
          },
        });
        await agentLoop.initialize();
      }
      await agentLoop!.attachBrowser(payload.tabId, payload.webContentsId);

      // Intercept window.open / target=_blank at the Chromium level
      // so they always open as new tabs instead of native OS windows.
      const wc = webContents.fromId(payload.webContentsId);
      if (wc) {
        wc.setWindowOpenHandler(({ url }) => {
          if (url && url !== "about:blank" && !url.startsWith("devtools://")) {
            const win = getMainWindow();
            if (win) {
              win.webContents.send(IPC.BROWSER_POPUP_OPEN, {
                tabId: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                url,
                sourceTabId: payload.tabId,
              });
            }
          }
          return { action: "deny" };
        });
      }
    } catch (err: any) {
      logger.error(`Failed to attach CDP via IPC: ${err.message}`);
    }
  });

  ipcMain.handle(IPC.BROWSER_NAVIGATE_TO, async (_event, url: string, tabId?: string) => {
    logger.info(`Navigate to: ${url}${tabId ? ` (tab: ${tabId})` : ""}`);
    if (agentLoop) {
      try {
        const snapshot = await agentLoop.navigateBrowser(url, tabId);
        const win = getMainWindow();
        if (win) {
          win.webContents.send(IPC.BROWSER_STATE_CHANGED, {
            tabId: tabId || "tab-initial",
            url: snapshot.pageState.url,
            title: snapshot.pageState.title,
            isLoading: false,
            canGoBack: false,
            canGoForward: false,
          });
        }
      } catch (err: any) {
        logger.error(`Navigation failed: ${err.message}`);
      }
    }
  });

  // ===== Tab Management =====

  // Tab creation is renderer-driven — the renderer creates the webview,
  // then dom-ready fires which triggers attachWebview to create the TabSession.
  // This handler is a no-op kept for forward compatibility.
  ipcMain.handle(IPC.TAB_CREATE, async () => {
    logger.info("Tab create requested (renderer-driven, no-op on main)");
  });

  ipcMain.handle(IPC.TAB_CLOSE, async (_event, tabId: string) => {
    logger.info(`Tab close requested: ${tabId}`);
    if (agentLoop) {
      agentLoop.browserManager.closeTab(tabId);
    }
  });

  ipcMain.handle(IPC.TAB_SWITCH, async (_event, tabId: string) => {
    logger.info(`Tab switch requested: ${tabId}`);
    if (agentLoop) {
      agentLoop.browserManager.setActiveTab(tabId);
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
        const win = getMainWindow();
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

  ipcMain.handle(IPC.VOICE_TRANSCRIBE, async (_event, req: { audioData: string; language?: string }) => {
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

  // ===== System =====

  ipcMain.handle(IPC.GET_APP_VERSION, async () => {
    return APP_VERSION;
  });

  logger.info("IPC handlers registered");
}
