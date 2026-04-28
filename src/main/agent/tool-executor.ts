import type { ToolDefinition } from "../../shared/tool-schemas";
import type { BrowserManager } from "../browser/browser-manager";
import type { LLMClient } from "./llm-client";
import { Logger } from "../utils/logger";
import { executeBrowserNavigate } from "./tools/browser/browser-navigate";
import { executeBrowserSnapshot } from "./tools/browser/browser-snapshot";
import { executeBrowserClick } from "./tools/browser/browser-click";
import { executeBrowserType } from "./tools/browser/browser-type";
import { executeBrowserScroll } from "./tools/browser/browser-scroll";
import { executeBrowserBack } from "./tools/browser/browser-back";
import { executeBrowserPress } from "./tools/browser/browser-press";
import { executeBrowserWait } from "./tools/browser/browser-wait";
import { executeBrowserGetPageState } from "./tools/browser/browser-get-page-state";
import { executeBrowserConsole } from "./tools/browser/browser-console";
import { executeBrowserVision } from "./tools/browser/browser-vision";
import { executeBrowserExtract } from "./tools/browser/browser-extract";
import { executeBrowserFillForm } from "./tools/browser/browser-fill-form";
import { executeBrowserRequestReview } from "./tools/browser/browser-request-review";

const logger = new Logger("ToolExec");

export interface ToolResult {
  success: boolean;
  result: string;
  error?: string;
  snapshot?: string; // Updated page snapshot after tool execution
}

export interface ToolHandler {
  definition: ToolDefinition;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

export type ToolName = string;

export class ToolExecutor {
  private handlers = new Map<ToolName, ToolHandler>();
  private browserManager: BrowserManager;
  private llmClient: LLMClient | null = null;
  private abortSignal: AbortSignal | null = null;
  private reviewCallback: ((reviewType: string, reason: string, content: unknown) => Promise<{ approved: boolean; modifications?: string }>) | null = null;

  constructor(browserManager: BrowserManager, llmClient?: LLMClient) {
    this.browserManager = browserManager;
    this.llmClient = llmClient || null;
  }

  /**
   * Register a tool handler.
   */
  register(handler: ToolHandler) {
    this.handlers.set(handler.definition.name, handler);
  }

  /**
   * Register all built-in browser tools.
   */
  registerBrowserTools() {
    const browser = this.browserManager;
    const llm = this.llmClient;
    const tools: ToolHandler[] = [
      executeBrowserNavigate(browser),
      executeBrowserSnapshot(browser),
      executeBrowserClick(browser),
      executeBrowserType(browser),
      executeBrowserScroll(browser),
      executeBrowserBack(browser),
      executeBrowserPress(browser),
      executeBrowserWait(browser),
      executeBrowserGetPageState(browser),
      executeBrowserConsole(browser),
      executeBrowserVision(browser, llm!),
      executeBrowserExtract(browser, llm!),
      executeBrowserFillForm(browser),
      executeBrowserRequestReview(),
    ];
    for (const tool of tools) {
      this.register(tool);
    }
    logger.info(`Registered ${tools.length} browser tools`);
  }

  /**
   * Set review callback — called when a tool requires user review.
   */
  setReviewCallback(
    cb: (reviewType: string, reason: string, content: unknown) => Promise<{ approved: boolean; modifications?: string }>
  ) {
    this.reviewCallback = cb;
  }

  /**
   * Execute a tool call by name.
   */
  async execute(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    if (this.abortSignal?.aborted) {
      return { success: false, result: "", error: "Agent aborted" };
    }

    const handler = this.handlers.get(name);
    if (!handler) {
      return {
        success: false,
        result: "",
        error: `Unknown tool: ${name}. Available: ${[...this.handlers.keys()].join(", ")}`,
      };
    }

    logger.info(`Executing tool: ${name}(${JSON.stringify(args).substring(0, 100)})`);

    try {
      const result = await handler.execute(args);
      logger.info(`Tool result (${result.success ? "success" : "error"}): ${result.result.substring(0, 200)}`);
      return result;
    } catch (err) {
      logger.error(`Tool ${name} threw: ${err}`);
      return {
        success: false,
        result: "",
        error: `Tool execution error: ${err}`,
      };
    }
  }

  /**
   * Get all registered tool definitions (for sending to LLM).
   */
  getToolDefinitions(): ToolDefinition[] {
    return [...this.handlers.values()].map((h) => h.definition);
  }

  /**
   * Set abort signal for interrupting tool execution.
   */
  setAbortSignal(signal: AbortSignal | null) {
    this.abortSignal = signal;
  }

  /**
   * Check if the agent has been aborted.
   */
  isAborted(): boolean {
    return this.abortSignal?.aborted ?? false;
  }
}
