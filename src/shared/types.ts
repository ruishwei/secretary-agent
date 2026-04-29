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
}

export interface ToolCallBlock {
  type: "tool-call";
  toolCallId: string;
  tool: string;
  args: Record<string, unknown>;
  status: "running" | "success" | "error";
  result?: string;
  error?: string;
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
  | AgentToolResultEvent
  | AgentResponseEvent
  | AgentReviewRequiredEvent
  | AgentErrorEvent
  | AgentDoneEvent;

export interface AgentThinkingEvent {
  type: "thinking";
  plan: string;
  currentStep?: number;
  totalSteps?: number;
}

export interface AgentToolStartEvent {
  type: "tool-start";
  toolCallId: string;
  tool: string;
  args: Record<string, unknown>;
}

export interface AgentToolResultEvent {
  type: "tool-result";
  toolCallId: string;
  tool: string;
  result: string;
  success: boolean;
  error?: string;
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

// ===== Browser State =====

export interface BrowserState {
  tabId: string;
  url: string;
  title: string;
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

export interface AppSettings {
  llm: {
    provider: "anthropic" | "openai";
    apiKey: string;
    model: string;
    maxTokens: number;
    baseUrl?: string;
  };
  voice: {
    provider: "whisper" | "webspeech" | "auto";
    language: string;
    whisperApiKey: string;
  };
  browser: {
    homeUrl: string;
    autoApproveDomains: string[];
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  llm: {
    provider: "anthropic",
    apiKey: "",
    model: "claude-sonnet-4-6",
    maxTokens: 4096,
  },
  voice: {
    provider: "auto",
    language: "zh-CN",
    whisperApiKey: "",
  },
  browser: {
    homeUrl: "about:blank",
    autoApproveDomains: [],
  },
};
