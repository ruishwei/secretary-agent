/**
 * IPC channel name constants.
 * Single source of truth for all main↔renderer communication channels.
 */
export const IPC = {
  // Chat
  SEND_MESSAGE: "chat:send-message",
  ABORT_AGENT: "chat:abort-agent",

  // Browser
  BROWSER_STATE_CHANGED: "browser:state-changed",
  BROWSER_SCREENSHOT: "browser:screenshot",
  BROWSER_NAVIGATE_TO: "browser:navigate-to",
  BROWSER_GO_BACK: "browser:go-back",
  BROWSER_GO_FORWARD: "browser:go-forward",
  BROWSER_REFRESH: "browser:refresh",
  BROWSER_STOP: "browser:stop",
  BROWSER_LAYOUT: "browser:layout",
  BROWSER_SET_VISIBLE: "browser:set-visible",

  // Tab management
  TAB_CREATE: "browser:tab-create",
  TAB_CLOSE: "browser:tab-close",
  TAB_SWITCH: "browser:tab-switch",
  TAB_LIST_CHANGED: "browser:tab-list-changed",
  TAB_STATE_CHANGED: "browser:tab-state-changed",
  BROWSER_POPUP_OPEN: "browser:popup-open",

  // Session Control
  TAKE_OVER: "session:take-over",
  HAND_BACK: "session:hand-back",
  MODE_CHANGED: "session:mode-changed",
  REVIEW_RESPONSE: "session:review-response",

  // Agent Events (streaming from main to renderer)
  AGENT_EVENT: "agent:event",

  // Voice
  VOICE_TRANSCRIBE: "voice:transcribe",
  VOICE_RESULT: "voice:result",

  // Settings
  GET_SETTINGS: "settings:get",
  UPDATE_SETTINGS: "settings:update",

  // Operation Recording
  RECORDING_START: "recording:start",
  RECORDING_STOP: "recording:stop",
  RECORDING_STATE_CHANGED: "recording:state-changed",
  RECORDING_SAVE_SKILL: "recording:save-skill",
  RECORDING_DISCARD_SKILL: "recording:discard-skill",

  // Password Manager
  PASSWORD_GET_ALL: "password:get-all",
  PASSWORD_SAVE: "password:save",
  PASSWORD_DELETE: "password:delete",

  // Memory Management
  MEMORY_GET_CONTENT: "memory:get-content",
  MEMORY_SET_CONTENT: "memory:set-content",

  // Skills Management
  SKILLS_LIST_ALL: "skills:list-all",
  SKILLS_GET_CONTENT: "skills:get-content",
  SKILLS_DELETE: "skills:delete",

  // Workspace
  WORKSPACE_GET_PATHS: "workspace:get-paths",
  WORKSPACE_OPEN_FOLDER: "workspace:open-folder",

  // System
  GET_APP_VERSION: "system:get-version",
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
