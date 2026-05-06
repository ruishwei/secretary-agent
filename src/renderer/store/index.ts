import { create } from "zustand";
import type { ChatMessage, BrowserState, SessionMode, ReviewRequest, AgentEvent, AppSettings, ChatMessageBlock, Tab, PlanItem, RecordingState } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/types";

// ===== Chat Slice =====

interface ChatSlice {
  /** All messages, keyed by task ID. Default task "" is the catch-all for non-task messages. */
  messagesByTaskId: Record<string, ChatMessage[]>;
  activeChatTaskId: string;
  isStreaming: boolean;
  setActiveChatTaskId: (taskId: string) => void;
  addMessage: (msg: ChatMessage, taskId?: string) => void;
  updateLastAssistantMessage: (content: string, taskId?: string) => void;
  appendBlockToLastAssistant: (block: ChatMessageBlock, taskId?: string) => void;
  updateToolCallBlock: (toolCallId: string, result: string, success: boolean, durationMs?: number, taskId?: string) => void;
  setStreaming: (streaming: boolean) => void;
  clearMessages: (taskId?: string) => void;
}

// ===== Browser Slice =====

interface BrowserSlice {
  tabs: Tab[];
  activeTabId: string | null;
  screenshotDataUrl: string | null;
  highlightedElement: string | null;
  addTab: (tab: Tab) => void;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTab: (tabId: string, patch: Partial<Tab>) => void;
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
  planItems: PlanItem[];
  setMode: (mode: SessionMode) => void;
  setAgentThinking: (plan: string | null) => void;
  addAgentAction: (action: AgentAction) => void;
  updateAgentActionResult: (toolCallId: string, result: string, success: boolean) => void;
  setReviewRequest: (req: ReviewRequest | null) => void;
  setPlanItems: (items: PlanItem[]) => void;
  clearAgentState: () => void;
}

export interface PendingSkillReview {
  skillName: string;
  content: string;
  actionCount: number;
}

// ===== Recording Slice =====

interface RecordingSlice {
  recordingState: RecordingState;
  setRecordingState: (state: RecordingState) => void;
  pendingSkillReview: PendingSkillReview | null;
  setPendingSkillReview: (review: PendingSkillReview | null) => void;
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
  startTime?: number;
  durationMs?: number;
}

// ===== Combined Store =====

export type AppStore = ChatSlice & BrowserSlice & SessionSlice & RecordingSlice & SettingsSlice;

function getTaskId(tid?: string): string {
  return tid || "";
}

export const useStore = create<AppStore>((set) => ({
  // Chat slice defaults — multi-task aware
  messagesByTaskId: {},
  activeChatTaskId: "",
  isStreaming: false,

  setActiveChatTaskId: (taskId) =>
    set((s) => ({
      activeChatTaskId: taskId,
      messagesByTaskId: s.messagesByTaskId[taskId]
        ? s.messagesByTaskId
        : { ...s.messagesByTaskId, [taskId]: [] },
    })),

  addMessage: (msg, taskId) =>
    set((s) => {
      const tid = getTaskId(taskId);
      const msgs = [...(s.messagesByTaskId[tid] || []), msg];
      return {
        messagesByTaskId: { ...s.messagesByTaskId, [tid]: msgs },
      };
    }),

  updateLastAssistantMessage: (content, taskId) =>
    set((s) => {
      const tid = getTaskId(taskId);
      const msgs = [...(s.messagesByTaskId[tid] || [])];
      const lastIdx = msgs.length - 1;
      if (lastIdx >= 0 && msgs[lastIdx].role === "assistant") {
        msgs[lastIdx] = { ...msgs[lastIdx], content };
      }
      return { messagesByTaskId: { ...s.messagesByTaskId, [tid]: msgs } };
    }),

  appendBlockToLastAssistant: (block, taskId) =>
    set((s) => {
      const tid = getTaskId(taskId);
      const msgs = [...(s.messagesByTaskId[tid] || [])];
      const lastIdx = msgs.length - 1;
      if (lastIdx >= 0 && msgs[lastIdx].role === "assistant") {
        const msg = msgs[lastIdx];
        if (block.type === "thinking") {
          const blocks = [...(msg.blocks || [])];
          const lastBlock = blocks[blocks.length - 1];
          if (lastBlock?.type === "thinking") {
            blocks[blocks.length - 1] = block;
          } else {
            blocks.push(block);
          }
          msgs[lastIdx] = { ...msg, blocks };
        } else if (block.type === "tool-call") {
          const blocks = [...(msg.blocks || []), block];
          msgs[lastIdx] = { ...msg, blocks };
        } else {
          const blocks = [...(msg.blocks || []), block];
          msgs[lastIdx] = { ...msg, blocks };
        }
      }
      return { messagesByTaskId: { ...s.messagesByTaskId, [tid]: msgs } };
    }),

  updateToolCallBlock: (toolCallId, result, success, durationMs?, taskId?) =>
    set((s) => {
      const tid = getTaskId(taskId);
      const msgs = [...(s.messagesByTaskId[tid] || [])];
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant" && msgs[i].blocks) {
          const blocks = msgs[i].blocks!.map((b) => {
            if (b.type === "tool-call" && b.toolCallId === toolCallId) {
              return { ...b, status: success ? "success" as const : "error" as const, result, durationMs };
            }
            return b;
          });
          msgs[i] = { ...msgs[i], blocks };
          break;
        }
      }
      return { messagesByTaskId: { ...s.messagesByTaskId, [tid]: msgs } };
    }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  clearMessages: (taskId) =>
    set((s) => {
      if (taskId) {
        const byId = { ...s.messagesByTaskId };
        delete byId[taskId];
        return { messagesByTaskId: byId };
      }
      // Clear all if no task specified
      return { messagesByTaskId: {} };
    }),

  // Browser slice defaults
  tabs: [],
  activeTabId: null,
  screenshotDataUrl: null,
  highlightedElement: null,
  addTab: (tab) =>
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tab.id })),
  removeTab: (tabId) =>
    set((s) => {
      const remaining = s.tabs.filter((t) => t.id !== tabId);
      let activeTabId = s.activeTabId;
      if (activeTabId === tabId) {
        activeTabId = remaining.length > 0 ? remaining[0].id : null;
      }
      return { tabs: remaining, activeTabId };
    }),
  setActiveTab: (tabId) => set({ activeTabId: tabId }),
  updateTab: (tabId, patch) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
    })),
  updateBrowserState: (state) =>
    set((s) => {
      const tabId = state.tabId || s.activeTabId;
      if (!tabId) return {};
      return {
        tabs: s.tabs.map((t) =>
          t.id === tabId
            ? {
                ...t,
                url: state.url ?? t.url,
                title: state.title ?? t.title,
                favicon: state.favicon ?? t.favicon,
                isLoading: state.isLoading ?? t.isLoading,
                canGoBack: state.canGoBack ?? t.canGoBack,
                canGoForward: state.canGoForward ?? t.canGoForward,
              }
            : t
        ),
      };
    }),
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
  planItems: [],
  setPlanItems: (items) => set({ planItems: items }),
  clearAgentState: () =>
    set({ agentThinking: null, agentActions: [], isStreaming: false }),

  // Recording slice defaults
  recordingState: { isRecording: false, actionCount: 0 },
  setRecordingState: (state) => set({ recordingState: state }),
  pendingSkillReview: null,
  setPendingSkillReview: (review) => set({ pendingSkillReview: review }),

  // Settings slice defaults
  settings: DEFAULT_SETTINGS,
  updateSettings: (partial) =>
    set((s) => ({ settings: { ...s.settings, ...partial } })),
}));
