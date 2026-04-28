import { create } from "zustand";
import type { ChatMessage, BrowserState, SessionMode, ReviewRequest, AgentEvent, AppSettings } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/types";

// ===== Chat Slice =====

interface ChatSlice {
  messages: ChatMessage[];
  isStreaming: boolean;
  addMessage: (msg: ChatMessage) => void;
  updateLastAssistantMessage: (content: string) => void;
  setStreaming: (streaming: boolean) => void;
  clearMessages: () => void;
}

// ===== Browser Slice =====

interface BrowserSlice {
  browserUrl: string;
  browserTitle: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  screenshotDataUrl: string | null;
  highlightedElement: string | null;
  updateBrowserState: (state: Partial<BrowserState>) => void;
  setScreenshot: (dataUrl: string | null) => void;
  setHighlightedElement: (ref: string | null) => void;
}

// ===== Session Slice =====

interface SessionSlice {
  mode: SessionMode;
  agentThinking: string | null;
  agentActions: AgentAction[];
  reviewRequest: ReviewRequest | null;
  setMode: (mode: SessionMode) => void;
  setAgentThinking: (plan: string | null) => void;
  addAgentAction: (action: AgentAction) => void;
  updateAgentActionResult: (toolCallId: string, result: string, success: boolean) => void;
  setReviewRequest: (req: ReviewRequest | null) => void;
  clearAgentState: () => void;
}

// ===== Settings Slice =====

interface SettingsSlice {
  settings: AppSettings;
  updateSettings: (partial: Partial<AppSettings>) => void;
}

// ===== Agent Action Type =====

export interface AgentAction {
  toolCallId: string;
  tool: string;
  args: Record<string, unknown>;
  status: "running" | "success" | "error";
  result?: string;
  error?: string;
}

// ===== Combined Store =====

export type AppStore = ChatSlice & BrowserSlice & SessionSlice & SettingsSlice;

export const useStore = create<AppStore>((set) => ({
  // Chat slice defaults
  messages: [],
  isStreaming: false,
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  updateLastAssistantMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages];
      const lastIdx = msgs.length - 1;
      if (lastIdx >= 0 && msgs[lastIdx].role === "assistant") {
        msgs[lastIdx] = { ...msgs[lastIdx], content };
      }
      return { messages: msgs };
    }),
  setStreaming: (streaming) => set({ isStreaming: streaming }),
  clearMessages: () => set({ messages: [] }),

  // Browser slice defaults
  browserUrl: "about:blank",
  browserTitle: "",
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  screenshotDataUrl: null,
  highlightedElement: null,
  updateBrowserState: (state) =>
    set((s) => ({
      browserUrl: state.url ?? s.browserUrl,
      browserTitle: state.title ?? s.browserTitle,
      isLoading: state.isLoading ?? s.isLoading,
      canGoBack: state.canGoBack ?? s.canGoBack,
      canGoForward: state.canGoForward ?? s.canGoForward,
    })),
  setScreenshot: (dataUrl) => set({ screenshotDataUrl: dataUrl }),
  setHighlightedElement: (ref) => set({ highlightedElement: ref }),

  // Session slice defaults
  mode: "ai",
  agentThinking: null,
  agentActions: [],
  reviewRequest: null,
  setMode: (mode) => set({ mode }),
  setAgentThinking: (plan) => set({ agentThinking: plan }),
  addAgentAction: (action) =>
    set((s) => ({ agentActions: [...s.agentActions, action] })),
  updateAgentActionResult: (toolCallId, result, success) =>
    set((s) => ({
      agentActions: s.agentActions.map((a) =>
        a.toolCallId === toolCallId
          ? { ...a, status: success ? "success" as const : "error" as const, result, error: success ? undefined : result }
          : a
      ),
    })),
  setReviewRequest: (req) => set({ reviewRequest: req }),
  clearAgentState: () =>
    set({ agentThinking: null, agentActions: [], isStreaming: false }),

  // Settings slice defaults
  settings: DEFAULT_SETTINGS,
  updateSettings: (partial) =>
    set((s) => ({ settings: { ...s.settings, ...partial } })),
}));
