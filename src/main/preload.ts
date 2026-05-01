import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/ipc-channels";
import type {
  SendMessageRequest,
  SendMessageResponse,
  AgentEvent,
  BrowserState,
  ReviewResponse,
  VoiceTranscribeRequest,
  VoiceResult,
  AppSettings,
  TabInfo,
  RecordingState,
  PasswordEntry,
  PasswordEntryInput,
  SkillInfo,
  MemoryContent,
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

  navigateTo: (url: string, tabId?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.BROWSER_NAVIGATE_TO, url, tabId),

  goBack: (tabId?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.BROWSER_GO_BACK, tabId),

  goForward: (tabId?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.BROWSER_GO_FORWARD, tabId),

  refresh: (tabId?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.BROWSER_REFRESH, tabId),

  stop: (tabId?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.BROWSER_STOP, tabId),

  updateBrowserLayout: (bounds: { x: number; y: number; width: number; height: number }): Promise<void> =>
    ipcRenderer.invoke(IPC.BROWSER_LAYOUT, bounds),

  setBrowserVisible: (visible: boolean): Promise<void> =>
    ipcRenderer.invoke(IPC.BROWSER_SET_VISIBLE, visible),

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
  reviewResponse: (reviewId: string, response: ReviewResponse, modifications?: string): Promise<void> =>
    ipcRenderer.invoke(IPC.REVIEW_RESPONSE, reviewId, response, modifications),

  // Voice
  transcribeVoice: (req: VoiceTranscribeRequest): Promise<VoiceResult> =>
    ipcRenderer.invoke(IPC.VOICE_TRANSCRIBE, req),

  // Settings
  getSettings: (): Promise<AppSettings> => ipcRenderer.invoke(IPC.GET_SETTINGS),
  updateSettings: (settings: Partial<AppSettings>): Promise<void> =>
    ipcRenderer.invoke(IPC.UPDATE_SETTINGS, settings),

  // Operation Recording
  startRecording: (): Promise<void> => ipcRenderer.invoke(IPC.RECORDING_START),

  stopRecording: (): Promise<{ success: boolean; actionCount: number; skillName?: string; skillContent?: string; error?: string }> =>
    ipcRenderer.invoke(IPC.RECORDING_STOP),

  saveSkill: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.RECORDING_SAVE_SKILL),

  discardSkill: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC.RECORDING_DISCARD_SKILL),

  onRecordingStateChanged: (callback: (state: RecordingState) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: RecordingState) => callback(data);
    ipcRenderer.on(IPC.RECORDING_STATE_CHANGED, handler);
    return () => ipcRenderer.removeListener(IPC.RECORDING_STATE_CHANGED, handler);
  },

  // Password Manager
  password: {
    getAll: (): Promise<PasswordEntry[]> => ipcRenderer.invoke(IPC.PASSWORD_GET_ALL),
    save: (input: PasswordEntryInput, id?: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.PASSWORD_SAVE, input, id),
    delete: (id: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.PASSWORD_DELETE, id),
  },

  // Memory Management
  memory: {
    getContent: (): Promise<MemoryContent> => ipcRenderer.invoke(IPC.MEMORY_GET_CONTENT),
    setContent: (target: "memory" | "user", content: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.MEMORY_SET_CONTENT, target, content),
  },

  // Skills Management
  skills: {
    listAll: (): Promise<SkillInfo[]> => ipcRenderer.invoke(IPC.SKILLS_LIST_ALL),
    getContent: (name: string): Promise<string | null> => ipcRenderer.invoke(IPC.SKILLS_GET_CONTENT, name),
    delete: (name: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke(IPC.SKILLS_DELETE, name),

    // Hub (ClawHub)
    hubSearch: (query: string, limit?: number, offset?: number): Promise<{
      results: Array<{ slug: string; name: string; description: string; version?: string; category?: string; author?: string; downloads?: number }>;
      total?: number;
      error?: string;
    }> => ipcRenderer.invoke(IPC.SKILL_HUB_SEARCH, query, limit, offset),

    hubGetSkill: (slug: string): Promise<{
      slug: string; name: string; description: string; version: string; category: string;
      author?: string; downloads?: number; skillMdContent?: string;
      error?: string;
    }> => ipcRenderer.invoke(IPC.SKILL_HUB_GET_SKILL, slug),

    hubInstall: (slug: string): Promise<{ success: boolean; skillName?: string; error?: string }> =>
      ipcRenderer.invoke(IPC.SKILL_HUB_INSTALL, slug),
  },

  // Workspace
  workspace: {
    getPaths: (): Promise<{ skillsPath: string; memoryPath: string; sessionsPath: string }> =>
      ipcRenderer.invoke(IPC.WORKSPACE_GET_PATHS),
    openFolder: (folderPath: string): Promise<void> => ipcRenderer.invoke(IPC.WORKSPACE_OPEN_FOLDER, folderPath),
  },

  // System
  getAppVersion: (): Promise<string> => ipcRenderer.invoke(IPC.GET_APP_VERSION),
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

export type ElectronAPI = typeof electronAPI;
