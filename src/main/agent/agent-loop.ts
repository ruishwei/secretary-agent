import { LLMClient, type LLMConfig } from "./llm-client";
import { ContextManager } from "./context-manager";
import { ToolExecutor } from "./tool-executor";
import { buildSystemPrompt, buildSkillsIndex, buildMemoryFlushPrompt } from "./prompt-templates";
import type { StateProvider } from "./state-provider";
import type { SkillManager } from "../skills/skill-manager";
import type { MemoryStore } from "../memory/memory-store";
import type { PrivacyGuard } from "../security/privacy-guard";
import type { AgentEvent } from "../../shared/types";
import { MAX_AGENT_TOOL_TURNS } from "../../shared/constants";

export interface AgentConfig {
  llm: LLMConfig;
}

export class AgentLoop {
  private llm: LLMClient;
  private context: ContextManager;
  private toolExecutor: ToolExecutor;
  private stateProvider: StateProvider;
  private skillManager: SkillManager | null = null;
  private memoryStore: MemoryStore | null = null;
  private privacyGuard: PrivacyGuard | null = null;
  private abortController: AbortController | null = null;
  private running = false;
  private turnCount = 0;

  constructor(config: AgentConfig, stateProvider: StateProvider, toolExecutor: ToolExecutor) {
    this.llm = new LLMClient(config.llm);
    this.stateProvider = stateProvider;
    this.toolExecutor = toolExecutor;

    this.context = new ContextManager(config.llm.maxTokens);
  }

  setSkillManager(sm: SkillManager): void {
    this.skillManager = sm;
  }

  setMemoryStore(ms: MemoryStore): void {
    this.memoryStore = ms;
  }

  setPrivacyGuard(pg: PrivacyGuard): void {
    this.privacyGuard = pg;
  }

  /**
   * Get the LLM client (for tool registration that needs it).
   */
  getLLMClient(): LLMClient {
    return this.llm;
  }

  /**
   * Update LLM configuration (e.g., when settings change).
   */
  updateLLMConfig(config: LLMConfig) {
    this.llm.updateConfig(config);
  }

  /**
   * Process a user message through the agent loop.
   * Yields AgentEvents for streaming back to the renderer.
   */
  async *run(userMessage: string, images?: string[]): AsyncGenerator<AgentEvent> {
    if (this.running) {
      yield { type: "error", message: "Agent is already running.", recoverable: true };
      return;
    }

    this.turnCount = 0;
    this.context.addUserMessage(userMessage, images);
    yield* this.runLoop();
  }

  /**
   * Abort the currently running agent loop.
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.running = false;
  }

  /**
   * Resume agent loop after user review.
   */
  async *resumeAfterReview(_reviewId: string, approved: boolean, modifications?: string): AsyncGenerator<AgentEvent> {
    if (approved) {
      const reviewMsg = modifications
        ? `User approved with modifications: ${modifications}. Please apply these changes and continue.`
        : "User approved. Please continue.";
      this.context.addUserMessage(reviewMsg);
      yield* this.runLoop();
    } else {
      yield { type: "done", summary: "User rejected the review. Task cancelled." };
      this.running = false;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  cleanup() {
    this.abort();
    this.stateProvider.cleanup();
  }

  // ===== Private: shared agent loop =====

  private async *runLoop(): AsyncGenerator<AgentEvent> {
    this.running = true;
    this.abortController = new AbortController();
    this.toolExecutor.setAbortSignal(this.abortController.signal);

    try {
      // Wait for state provider to be ready
      yield { type: "thinking", plan: "Waiting for environment to be ready..." };
      try {
        await this.stateProvider.waitUntilReady();
      } catch {
        yield { type: "error", message: this.stateProvider.getNotReadyMessage?.() ?? "Environment is not ready. Please check plugin status.", recoverable: true };
        return;
      }

      // Main agent loop
      while (this.turnCount < MAX_AGENT_TOOL_TURNS) {
        if (this.abortController?.signal.aborted) {
          yield { type: "done", summary: "Agent aborted by user." };
          return;
        }

        // Check context compaction
        if (this.context.shouldCompact()) {
          // Prompt to save durable knowledge before compressing
          if (this.memoryStore) {
            yield {
              type: "thinking",
              plan: buildMemoryFlushPrompt({
                newFacts: [],
                userPreferences: [],
                environmentChanges: [],
              }),
            };
          }
          yield { type: "thinking", plan: "Compacting conversation context..." };
          this.context.compact();
        }

        this.turnCount++;

        // Build system prompt from domain state providers
        const sections = this.stateProvider.getContextSections();

        // Add async snapshot section if available
        if (this.stateProvider.buildSnapshotSection) {
          const snapshotSection = await this.stateProvider.buildSnapshotSection();
          if (snapshotSection) {
            sections.push(snapshotSection);
          }
        }

        // Load memory snapshots (frozen at session start — writes don't refresh them)
        const memorySection = this.memoryStore?.getMemorySnapshot();
        const shallowMemorySection = this.memoryStore?.getRecentShallow();
        const userProfileSection = this.memoryStore?.getUserProfile();
        const skillsIndex = this.skillManager?.getSkillsIndex()
          ? buildSkillsIndex(this.skillManager.getSkillsIndex())
          : undefined;

        const privacySection = this.privacyGuard?.getSystemPromptSection();

        const systemPrompt = buildSystemPrompt(sections, {
          memorySection,
          shallowMemorySection,
          userProfileSection,
          skillsIndex,
          privacySection,
        });
        this.context.setSystemPrompt(systemPrompt);

        const tools = this.toolExecutor.getToolDefinitions();

        // Call LLM
        yield {
          type: "thinking",
          plan: `Turn ${this.turnCount}/${MAX_AGENT_TOOL_TURNS}: Analyzing current state and deciding next action...`,
        };

        let finalText = "";
        let finalToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
        let finalThinkingBlocks: Array<{ thinking: string; signature?: string }> | undefined;

        try {
          for await (const response of this.llm.sendMessage(
            systemPrompt,
            this.context.getMessages(),
            tools,
            { signal: this.abortController?.signal }
          )) {
            if (response.thinkingText) {
              yield { type: "thinking", plan: response.thinkingText, reasoning: response.thinkingText };
            }
            if (response.text) {
              finalText = response.text;
              yield { type: "response", text: finalText };
            }
            if (response.toolCalls && response.toolCalls.length > 0) {
              finalToolCalls = response.toolCalls;
            }
            if (response.thinkingBlocks) {
              finalThinkingBlocks = response.thinkingBlocks;
            }
          }
        } catch (err: any) {
          if (err.name === "AbortError") {
            yield { type: "done", summary: "Agent aborted." };
            return;
          }
          yield { type: "error", message: `LLM error: ${err.message}`, recoverable: true };
          return;
        }

        // If no tool calls, this is the final response
        if (finalToolCalls.length === 0) {
          this.context.addAssistantResponse(finalText, undefined, finalThinkingBlocks);
          yield { type: "done", summary: finalText };
          return;
        }

        // Process tool calls
        this.context.addAssistantResponse(finalText, finalToolCalls, finalThinkingBlocks);

        // Yield tool start events with timestamps
        const toolStartTimes = new Map<string, number>();
        for (const tc of finalToolCalls) {
          const timestamp = Date.now();
          toolStartTimes.set(tc.id, timestamp);
          yield {
            type: "tool-start",
            toolCallId: tc.id,
            tool: tc.name,
            args: tc.input,
            timestamp,
          };
        }

        // Execute tools — wrapped to prevent orphaned tool_calls in context
        const toolResults: Array<{ toolCallId: string; name: string; result: string; isError?: boolean }> = [];

        try {
          for (const tc of finalToolCalls) {
            const startTime = toolStartTimes.get(tc.id) || Date.now();

            // Interleaved progress: pump progress events while tool runs
            const progressQueue: Array<{ progressType: "thinking" | "text"; content: string }> = [];
            let progressWakeup: (() => void) | null = null;

            const nextProgress = (): Promise<void> =>
              new Promise<void>((resolve) => {
                if (progressQueue.length > 0) { resolve(); return; }
                progressWakeup = resolve;
              });

            const toolPromise = this.toolExecutor.execute(tc.name, tc.input, (progress) => {
              progressQueue.push({ progressType: progress.type, content: progress.content });
              if (progressWakeup) { progressWakeup(); progressWakeup = null; }
            });

            let toolResult: { result: string; success: boolean; error?: string; snapshot?: string };

            try {
              while (true) {
                let resolved = false;
                let resolvedValue: typeof toolResult | undefined;

                await Promise.race([
                  toolPromise.then((r) => { resolved = true; resolvedValue = r; }),
                  nextProgress(),
                ]);

                while (progressQueue.length > 0) {
                  const p = progressQueue.shift()!;
                  yield {
                    type: "tool-progress" as const,
                    toolCallId: tc.id,
                    tool: tc.name,
                    progressType: p.progressType,
                    content: p.content,
                  };
                }

                if (resolved) { toolResult = resolvedValue!; break; }
              }
            } catch (err: any) {
              toolResult = {
                success: false,
                result: "",
                error: `Tool execution error: ${err.message}`,
              };
            }
            const durationMs = Date.now() - startTime;

            // Yield tool result with timing
            yield {
              type: "tool-result",
              toolCallId: tc.id,
              tool: tc.name,
              result: toolResult.error || toolResult.result,
              success: toolResult.success,
              error: toolResult.error,
              durationMs,
            };

            toolResults.push({
              toolCallId: tc.id,
              name: tc.name,
              result: toolResult.error || toolResult.result,
              isError: !toolResult.success,
            });

            // If a tool returned a fresh snapshot, update the prompt for the next LLM call
            if (toolResult.snapshot) {
              this.stateProvider.upsertSnapshotSection?.(sections, toolResult.snapshot);
            }
          }
        } finally {
          // Ensure every tool call has a response, preventing orphaned tool_calls
          // that would cause "tool_call_ids did not have response messages" errors
          const covered = new Set(toolResults.map((r) => r.toolCallId));
          for (const tc of finalToolCalls) {
            if (!covered.has(tc.id)) {
              toolResults.push({
                toolCallId: tc.id,
                name: tc.name,
                result: "Tool execution interrupted",
                isError: true,
              });
            }
          }
          this.context.addToolResults(toolResults);
          // Clear plan snapshot captures — they're only valid for this turn
          this.stateProvider.clearPlanSnapshots?.();
        }

        // Check tool metas for special dispatch events
        for (const tc of finalToolCalls) {
          const meta = this.toolExecutor.getToolMeta(tc.name);

          if (meta?.emitsPlanUpdate && tc.input.items) {
            yield {
              type: "plan-update",
              items: tc.input.items as Array<{ id: string; text: string; status: "pending" | "in_progress" | "completed" }>,
            };
          }

          if (meta?.emitsReviewRequired) {
            yield {
              type: "review-required",
              reviewType: (tc.input.reviewType as any) || "content-draft",
              title: (tc.input.reason as string) || "Review Required",
              description: `The agent is requesting review for: ${tc.name}`,
              content: tc.input,
              reviewId: `review-${Date.now()}`,
            };
            this.running = false;
            return; // Pause agent until user responds
          }
        }

        // Loop back for next turn
        yield {
          type: "thinking",
          plan: `Turn ${this.turnCount} complete. Processing results and continuing...`,
        };
      }

      // Max turns reached
      yield {
        type: "error",
        message: `Reached maximum tool turns (${MAX_AGENT_TOOL_TURNS}). The task may be too complex. Try breaking it into smaller steps.`,
        recoverable: false,
      };
    } finally {
      // Save session transcript for future session_search
      if (this.memoryStore) {
        try {
          const messages = this.context.getMessages().map((m) => ({
            role: m.role,
            content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
          }));
          this.memoryStore.saveSession(messages);
        } catch {
          // Don't let session saving break the agent
        }
      }
      this.running = false;
      this.abortController = null;
      this.toolExecutor.setAbortSignal(null);
    }
  }
}
