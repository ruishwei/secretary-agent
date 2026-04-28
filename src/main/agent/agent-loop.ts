import { BrowserWindow } from "electron";
import { LLMClient, type LLMConfig } from "./llm-client";
import { ContextManager } from "./context-manager";
import { ToolExecutor, type ToolResult } from "./tool-executor";
import { buildSystemPrompt } from "./prompt-templates";
import { CDPClient } from "../browser/cdp-client";
import { BrowserManager } from "../browser/browser-manager";
import { IPC } from "../../shared/ipc-channels";
import type { AgentEvent } from "../../shared/types";
import { MAX_AGENT_TOOL_TURNS } from "../../shared/constants";
import { Logger } from "../utils/logger";

const logger = new Logger("Agent");

export interface AgentConfig {
  llm: LLMConfig;
}

export class AgentLoop {
  private llm: LLMClient;
  private context: ContextManager;
  private toolExecutor: ToolExecutor;
  private browserManager: BrowserManager;
  private cdp: CDPClient;
  private abortController: AbortController | null = null;
  private running = false;
  private turnCount = 0;

  constructor(config: AgentConfig) {
    this.llm = new LLMClient(config.llm);
    this.cdp = new CDPClient();
    this.browserManager = new BrowserManager(this.cdp);
    this.toolExecutor = new ToolExecutor(this.browserManager);
    this.toolExecutor.registerBrowserTools();
    this.context = new ContextManager(config.llm.maxTokens);
  }

  /**
   * Initialize browser CDP connection.
   */
  async initialize(): Promise<void> {
    await this.browserManager.initialize();
    logger.info("Agent loop initialized");
  }

  /**
   * Attach CDP to a specific webview by its webContents ID.
   */
  async attachBrowser(webContentsId: number): Promise<void> {
    await this.browserManager.attachToWebview(webContentsId);
  }

  /**
   * Navigate the embedded browser to a URL and return a snapshot.
   */
  async navigateBrowser(url: string) {
    return this.browserManager.navigate(url);
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
  async *run(userMessage: string): AsyncGenerator<AgentEvent> {
    if (this.running) {
      yield { type: "error", message: "Agent is already running.", recoverable: true };
      return;
    }

    this.running = true;
    this.turnCount = 0;
    this.abortController = new AbortController();
    this.toolExecutor.setAbortSignal(this.abortController.signal);

    // Add user message to context
    this.context.addUserMessage(userMessage);

    // Build system prompt
    const pageState = this.browserManager.getPageState();
    const systemPrompt = buildSystemPrompt({
      mode: "ai",
      currentUrl: pageState.url,
      // Memory and skills will be populated in Phase 5/6
    });

    this.context.setSystemPrompt(systemPrompt);

    try {
      // Wait for browser to be ready (webview CDP attached)
      yield { type: "thinking", plan: "Waiting for browser to be ready..." };
      try {
        await this.browserManager.waitUntilReady();
      } catch {
        yield { type: "error", message: "Browser is not ready. Please make sure the webview has loaded.", recoverable: true };
        return;
      }

      // Main agent loop
      while (this.turnCount < MAX_AGENT_TOOL_TURNS) {
        if (this.abortController.signal.aborted) {
          yield { type: "done", summary: "Agent aborted by user." };
          return;
        }

        // Check context compaction
        if (this.context.shouldCompact()) {
          yield { type: "thinking", plan: "Compacting conversation context..." };
          this.context.compact();
        }

        this.turnCount++;

        // Get current page snapshot for the AI
        // (This is done each turn so the AI always has fresh page state)
        let pageSnapshot: string | undefined;
        try {
          const snapshot = await this.browserManager.getSnapshot();
          pageSnapshot = snapshot.text;
        } catch {
          // Browser might not have a page loaded yet
        }

        // Update system prompt with fresh page data
        const currentPrompt = buildSystemPrompt({
          mode: "ai",
          currentUrl: this.browserManager.getPageState().url,
          pageSnapshot,
        });
        this.context.setSystemPrompt(currentPrompt);

        const tools = this.toolExecutor.getToolDefinitions();

        // Call LLM
        yield {
          type: "thinking",
          plan: `Turn ${this.turnCount}/${MAX_AGENT_TOOL_TURNS}: Analyzing page and deciding next action...`,
        };

        let finalText = "";
        let finalToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
        let finalThinkingBlocks: Array<{ thinking: string; signature?: string }> | undefined;

        try {
          for await (const response of this.llm.sendMessage(
            currentPrompt,
            this.context.getMessages(),
            tools,
            { signal: this.abortController.signal }
          )) {
            if (response.text) {
              finalText = response.text;
              // Stream text updates
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

        // Yield tool start events
        for (const tc of finalToolCalls) {
          yield {
            type: "tool-start",
            toolCallId: tc.id,
            tool: tc.name,
            args: tc.input,
          };
        }

        // Execute tools
        const toolResults: Array<{ toolCallId: string; name: string; result: string; isError?: boolean }> = [];

        for (const tc of finalToolCalls) {
          const result = await this.toolExecutor.execute(tc.name, tc.input);

          // Yield tool result
          yield {
            type: "tool-result",
            toolCallId: tc.id,
            tool: tc.name,
            result: result.error || result.result,
            success: result.success,
            error: result.error,
          };

          toolResults.push({
            toolCallId: tc.id,
            name: tc.name,
            result: result.error || result.result,
            isError: !result.success,
          });

          // If a tool returned a fresh snapshot, update the prompt for the next LLM call
          if (result.snapshot) {
            pageSnapshot = result.snapshot;
          }
        }

        // Add tool results to context
        this.context.addToolResults(toolResults);

        // Check if any tool requires review
        for (const tc of finalToolCalls) {
          if (tc.name === "browser_request_review") {
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
      this.running = false;
      this.abortController = null;
      this.toolExecutor.setAbortSignal(null);
    }
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
  async *resumeAfterReview(reviewId: string, approved: boolean, modifications?: string): AsyncGenerator<AgentEvent> {
    if (approved) {
      // Add the review result to context
      const reviewMsg = modifications
        ? `User approved with modifications: ${modifications}. Please apply these changes and continue.`
        : "User approved. Please continue.";
      this.context.addUserMessage(reviewMsg);

      // Continue the agent loop with this message
      yield* this.continueLoop();
    } else {
      yield { type: "done", summary: "User rejected the review. Task cancelled." };
      this.running = false;
    }
  }

  /**
   * Continue agent loop after hand-back from user mode.
   */
  async *continueAfterHandBack(): AsyncGenerator<AgentEvent> {
    // Capture current page state after user's manual operations
    const pageState = this.browserManager.getPageState();
    let snapshot: string | undefined;
    try {
      snapshot = (await this.browserManager.getSnapshot(true)).text;
    } catch { /* ignore */ }

    const resumeMsg = `The user has handed back control. Current page state:
URL: ${pageState.url}
Title: ${pageState.title}
${snapshot ? `Page content:\n${snapshot}` : "(browser state unavailable)"}

Please review what the user did and continue with the task.`;

    this.context.addUserMessage(resumeMsg);
    yield* this.continueLoop();
  }

  /**
   * Internal method to continue the agent loop from current context.
   */
  private async *continueLoop(): AsyncGenerator<AgentEvent> {
    this.running = true;
    this.abortController = new AbortController();
    this.toolExecutor.setAbortSignal(this.abortController.signal);

    try {
      // Wait for browser to be ready before continuing
      await this.browserManager.waitUntilReady();

      // Re-run the loop (reuses the existing context with new user message)
      while (this.turnCount < MAX_AGENT_TOOL_TURNS) {
        if (this.abortController.signal.aborted) {
          yield { type: "done", summary: "Agent aborted." };
          return;
        }

        this.turnCount++;

        let pageSnapshot: string | undefined;
        try {
          pageSnapshot = (await this.browserManager.getSnapshot()).text;
        } catch { /* ignore */ }

        const currentPrompt = buildSystemPrompt({
          mode: "ai",
          currentUrl: this.browserManager.getPageState().url,
          pageSnapshot,
        });
        this.context.setSystemPrompt(currentPrompt);

        const tools = this.toolExecutor.getToolDefinitions();

        yield { type: "thinking", plan: `Turn ${this.turnCount}: Analyzing and deciding...` };

        let finalText = "";
        let finalToolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];
        let finalThinkingBlocks: Array<{ thinking: string; signature?: string }> | undefined;

        for await (const response of this.llm.sendMessage(
          currentPrompt,
          this.context.getMessages(),
          tools,
          { signal: this.abortController.signal }
        )) {
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

        if (finalToolCalls.length === 0) {
          this.context.addAssistantResponse(finalText, undefined, finalThinkingBlocks);
          yield { type: "done", summary: finalText };
          return;
        }

        this.context.addAssistantResponse(finalText, finalToolCalls, finalThinkingBlocks);

        for (const tc of finalToolCalls) {
          yield { type: "tool-start", toolCallId: tc.id, tool: tc.name, args: tc.input };
        }

        const toolResults: Array<{ toolCallId: string; name: string; result: string; isError?: boolean }> = [];
        for (const tc of finalToolCalls) {
          const result = await this.toolExecutor.execute(tc.name, tc.input);
          yield {
            type: "tool-result",
            toolCallId: tc.id,
            tool: tc.name,
            result: result.error || result.result,
            success: result.success,
            error: result.error,
          };
          toolResults.push({
            toolCallId: tc.id,
            name: tc.name,
            result: result.error || result.result,
            isError: !result.success,
          });
        }
        this.context.addToolResults(toolResults);
      }
    } finally {
      this.running = false;
      this.abortController = null;
      this.toolExecutor.setAbortSignal(null);
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  cleanup() {
    this.abort();
    this.browserManager.cleanup();
  }
}
