import type { IpcChannel } from "../../shared/ipc-channels";

/**
 * Registry of IPC channel metadata — maps channels to handler names for logging/debugging.
 */
export interface IpcChannelMeta {
  channel: IpcChannel;
  description: string;
  direction: "renderer-to-main" | "main-to-renderer";
}

export const IPC_CHANNELS: IpcChannelMeta[] = [
  { channel: "chat:send-message" as IpcChannel, description: "Send chat message", direction: "renderer-to-main" },
  { channel: "chat:abort-agent" as IpcChannel, description: "Abort agent execution", direction: "renderer-to-main" },
  { channel: "browser:state-changed" as IpcChannel, description: "Browser state update", direction: "main-to-renderer" },
  { channel: "browser:screenshot" as IpcChannel, description: "Browser screenshot", direction: "main-to-renderer" },
  { channel: "browser:navigate-to" as IpcChannel, description: "Navigate browser", direction: "renderer-to-main" },
  { channel: "session:take-over" as IpcChannel, description: "User takes over", direction: "renderer-to-main" },
  { channel: "session:hand-back" as IpcChannel, description: "User hands back", direction: "renderer-to-main" },
  { channel: "session:mode-changed" as IpcChannel, description: "Session mode changed", direction: "main-to-renderer" },
  { channel: "session:review-response" as IpcChannel, description: "Review response", direction: "renderer-to-main" },
  { channel: "agent:event" as IpcChannel, description: "Agent streaming event", direction: "main-to-renderer" },
  { channel: "voice:transcribe" as IpcChannel, description: "Transcribe voice", direction: "renderer-to-main" },
  { channel: "voice:result" as IpcChannel, description: "Voice result", direction: "main-to-renderer" },
  { channel: "settings:get" as IpcChannel, description: "Get settings", direction: "renderer-to-main" },
  { channel: "settings:update" as IpcChannel, description: "Update settings", direction: "renderer-to-main" },
  { channel: "system:get-version" as IpcChannel, description: "Get app version", direction: "renderer-to-main" },
];
