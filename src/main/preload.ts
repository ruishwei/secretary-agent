import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc-channels";
import type {
  SendMessageRequest,
  SendMessageResponse,
  AgentEvent,
  BrowserState,
  SessionModeChangedEvent,
  ReviewResponse,
  VoiceTranscribeRequest,
  VoiceResult,
  AppSettings,
} from "../shared/types";

/**
 * Typed API exposed to the renderer process via contextBridge.
 * Only these specific methods are available — no raw ipcRenderer access.
 */
const electronAPI = {
  // Chat
  sendMessage: (req: SendMessageRequest): Promise<SendMessageResponse> =>
    ipcRenderer.invoke(IPC.SEND_MESSAGE, req),

  abortAgent: (): Promise<void> => ipcRenderer.invoke(IPC.ABORT_AGENT),

  // Agent Events (streaming from main)
  onAgentEvent: (callback: (event: AgentEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: AgentEvent) => callback(data);
    ipcRenderer.on(IPC.AGENT_EVENT, handler);
    return () => ipcRenderer.removeListener(IPC.AGENT_EVENT, handler);
  },

  // Browser
  onBrowserStateChanged: (callback: (state: BrowserState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: BrowserState) => callback(data);
    ipcRenderer.on(IPC.BROWSER_STATE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.BROWSER_STATE_CHANGED, handler);
  },

  onScreenshot: (callback: (dataUrl: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, dataUrl: string) => callback(dataUrl);
    ipcRenderer.on(IPC.BROWSER_SCREENSHOT, handler);
    return () => ipcRenderer.removeListener(IPC.BROWSER_SCREENSHOT, handler);
  },

  attachWebview: (webContentsId: number): Promise<void> =>
    ipcRenderer.invoke(IPC.BROWSER_ATTACH_WEBVIEW, webContentsId),

  navigateTo: (url: string): Promise<void> =>
    ipcRenderer.invoke(IPC.BROWSER_NAVIGATE_TO, url),

  // Session Control
  takeOver: (): Promise<void> => ipcRenderer.invoke(IPC.TAKE_OVER),
  handBack: (): Promise<void> => ipcRenderer.invoke(IPC.HAND_BACK),

  onModeChanged: (callback: (event: SessionModeChangedEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: SessionModeChangedEvent) =>
      callback(data);
    ipcRenderer.on(IPC.MODE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.MODE_CHANGED, handler);
  },

  reviewResponse: (reviewId: string, response: ReviewResponse, modifications?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.REVIEW_RESPONSE, reviewId, response, modifications),

  // Voice
  transcribeVoice: (req: VoiceTranscribeRequest): Promise<VoiceResult> =>
    ipcRenderer.invoke(IPC.VOICE_TRANSCRIBE, req),

  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.GET_SETTINGS),
  updateSettings: (settings: Partial<AppSettings>): Promise<void> =>
    ipcRenderer.invoke(IPC.UPDATE_SETTINGS, settings),

  // System
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC.GET_APP_VERSION),
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
