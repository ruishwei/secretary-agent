/**
 * IPC channel name constants.
 * Single source of truth for all main↔renderer communication channels.
 */
export const IPC = {
  // Chat
  SEND_MESSAGE: "chat:send-message",
  ABORT_AGENT: "chat:abort-agent",

  // Browser
  BROWSER_ATTACH_WEBVIEW: "browser:attach-webview",
  BROWSER_STATE_CHANGED: "browser:state-changed",
  BROWSER_SCREENSHOT: "browser:screenshot",
  BROWSER_NAVIGATE_TO: "browser:navigate-to",

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

  // System
  GET_APP_VERSION: "system:get-version",
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
