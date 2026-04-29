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
  TabInfo,
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

  attachWebview: (tabId: string, webContentsId: number): Promise<void> =>
    ipcRenderer.invoke(IPC.BROWSER_ATTACH_WEBVIEW, { tabId, webContentsId }),

  navigateTo: (url: string, tabId?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.BROWSER_NAVIGATE_TO, url, tabId),

  // Tab management
  createTab: (url?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.TAB_CREATE, url),

  closeTab: (tabId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.TAB_CLOSE, tabId),

  switchTab: (tabId: string): Promise<void> =>
    ipcRenderer.invoke(IPC.TAB_SWITCH, tabId),

  onTabListChanged: (callback: (data: { tabs: TabInfo[]; activeTabId: string | null }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabs: TabInfo[]; activeTabId: string | null }) => callback(data);
    ipcRenderer.on(IPC.TAB_LIST_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.TAB_LIST_CHANGED, handler);
  },

  onTabStateChanged: (callback: (state: BrowserState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: BrowserState) => callback(data);
    ipcRenderer.on(IPC.TAB_STATE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.TAB_STATE_CHANGED, handler);
  },

  onPopupOpen: (callback: (data: { tabId: string; url: string; sourceTabId: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { tabId: string; url: string; sourceTabId: string }) => callback(data);
    ipcRenderer.on(IPC.BROWSER_POPUP_OPEN, handler);
    return () => ipcRenderer.removeListener(IPC.BROWSER_POPUP_OPEN, handler);
  },

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
