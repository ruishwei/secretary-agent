/**
 * Shared type definitions for main↔renderer communication.
 */

// ===== Chat Messages =====

export interface SendMessageRequest {
  text: string;
  attachments?: { name: string; dataUrl: string }[];
}

export interface SendMessageResponse {
  messageId: string;
  status: "queued" | "rejected";
  reason?: string;
}

// ===== Tab Types =====

export interface Tab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  webContentsId: number | null;
}

export interface TabInfo {
  tabId: string;
  url: string;
  title: string;
  favicon?: string;
  isActive: boolean;
}

// ===== Chat Messages =====

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolCalls?: ToolCallRecord[];
  blocks?: ChatMessageBlock[];
}

export type ChatMessageBlock =
  | TextBlock
  | ThinkingBlock
  | ToolCallBlock
  | ToolResultBlock;

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ThinkingBlock {
  type: "thinking";
  thinking: string;
  reasoning?: string;  // LLM's streaming reasoning content
}

export interface ToolCallBlock {
  type: "tool-call";
  toolCallId: string;
  tool: string;
  args: Record<string, unknown>;
  status: "running" | "success" | "error";
  result?: string;
  error?: string;
  durationMs?: number;
}

export interface ToolResultBlock {
  type: "tool-result";
  toolCallId: string;
  result: string;
  success: boolean;
  error?: string;
}

export interface ToolCallRecord {
  toolCallId: string;
  tool: string;
  args: Record<string, unknown>;
  result?: string;
  success: boolean;
  error?: string;
}

// ===== Agent Events (streaming) =====

export type AgentEvent =
  | AgentThinkingEvent
  | AgentToolStartEvent
  | AgentToolProgressEvent
  | AgentToolResultEvent
  | AgentResponseEvent
  | AgentReviewRequiredEvent
  | AgentPlanUpdateEvent
  | AgentErrorEvent
  | AgentDoneEvent;

export interface AgentThinkingEvent {
  type: "thinking";
  plan: string;
  reasoning?: string;  // LLM's real-time reasoning content (streaming)
  currentStep?: number;
  totalSteps?: number;
}

export interface AgentToolProgressEvent {
  type: "tool-progress";
  toolCallId: string;
  tool: string;
  progressType: "thinking" | "text";
  content: string;
}

export interface AgentToolStartEvent {
  type: "tool-start";
  toolCallId: string;
  tool: string;
  args: Record<string, unknown>;
  timestamp?: number;
}

export interface AgentToolResultEvent {
  type: "tool-result";
  toolCallId: string;
  tool: string;
  result: string;
  success: boolean;
  error?: string;
  durationMs?: number;
}

export interface AgentResponseEvent {
  type: "response";
  text: string;
}

export interface AgentReviewRequiredEvent {
  type: "review-required";
  reviewType: "form-submit" | "content-draft" | "navigation" | "delete-action";
  title: string;
  description: string;
  content: unknown;
  reviewId: string;
}

export interface AgentErrorEvent {
  type: "error";
  message: string;
  recoverable: boolean;
  toolCallId?: string;
}

export interface AgentDoneEvent {
  type: "done";
  summary: string;
}

export interface PlanItem {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed";
}

export interface AgentPlanUpdateEvent {
  type: "plan-update";
  items: PlanItem[];
}

// ===== Browser State =====

export interface BrowserState {
  tabId: string;
  url: string;
  title: string;
  favicon?: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
}

// ===== Session Modes =====

export type SessionMode = "ai" | "user" | "review";

export interface SessionModeChangedEvent {
  mode: SessionMode;
  reason: string;
  reviewId?: string;
}

// ===== Review Types =====

export interface ReviewRequest {
  reviewId: string;
  reviewType: "form-submit" | "content-draft" | "navigation" | "delete-action";
  title: string;
  description: string;
  content: unknown;
}

export type ReviewResponse = "approved" | "rejected" | "modified";

// ===== Voice =====

export interface VoiceTranscribeRequest {
  audioData: string; // base64-encoded audio
  language?: string;
}

export interface VoiceResult {
  text: string;
  confidence: number;
  provider: "whisper" | "webspeech";
}

// ===== Settings =====

export interface LlmConfigEntry {
  id: string;
  name: string;
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
  maxTokens: number;
  baseUrl?: string;
  supportsVision?: boolean;
}

export interface AppSettings {
  llmConfigs: LlmConfigEntry[];
  activeLlmConfigId: string;
  voice: {
    provider: "whisper" | "webspeech" | "auto";
    language: string;
    whisperApiKey: string;
  };
  browser: {
    homeUrl: string;
    autoApproveDomains: string[];
    screenshotQuality: number;
  };
  language: "zh-CN" | "en";
  shortcuts: {
    voiceInput: string;
  };
  privacy: {
    autoFillEnabled: boolean;
  };
  workspace: {
    skillsPath: string;
    memoryPath: string;
    sessionsPath: string;
  };
}

// ===== Operation Recording =====

export interface RecordedAction {
  type: "navigate" | "click" | "input" | "select" | "scroll" | "submit";
  timestamp: number;
  url?: string;
  selector?: string;
  tagName?: string;
  textContent?: string;
  fieldLabel?: string;
  fieldName?: string;
  inputType?: string;
  value?: string;
  direction?: string;
}

export interface RecordingState {
  isRecording: boolean;
  startedAt?: number;
  actionCount: number;
  tabId?: string;
}

// ===== Password Manager =====

export interface PasswordEntry {
  id: string;
  domain: string;
  username: string;
  password: string; // decrypted when sent to renderer
  createdAt: number;
  updatedAt: number;
}

export interface PasswordEntryInput {
  domain: string;
  username: string;
  password: string;
}

// ===== Skills Management =====

export interface SkillInfo {
  name: string;
  category: string;
  description: string;
  version: string;
  isBundled: boolean;
}

// ===== Memory Management =====

export interface MemoryContent {
  memory: string;
  user: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  llmConfigs: [
    {
      id: "cfg-default",
      name: "Default",
      provider: "anthropic" as const,
      apiKey: "",
      model: "claude-sonnet-4-6",
      maxTokens: 4096,
      supportsVision: true,
    },
  ],
  activeLlmConfigId: "cfg-default",
  voice: {
    provider: "auto",
    language: "zh-CN",
    whisperApiKey: "",
  },
  browser: {
    homeUrl: "about:blank",
    autoApproveDomains: [],
    screenshotQuality: 80,
  },
  language: "zh-CN",
  shortcuts: {
    voiceInput: "Ctrl+D",
  },
  privacy: {
    autoFillEnabled: false,
  },
  workspace: {
    skillsPath: "",
    memoryPath: "",
    sessionsPath: "",
  },
};
