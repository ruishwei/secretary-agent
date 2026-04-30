import type { ToolDefinition } from "../../shared/tool-schemas";
import type { LLMClient } from "./llm-client";
import { Logger } from "../utils/logger";

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
  private llmClient: LLMClient | null = null;
  private abortSignal: AbortSignal | null = null;
  private rendererCallback: ((channel: string, data: unknown) => void) | null = null;

  constructor(llmClient?: LLMClient) {
    this.llmClient = llmClient || null;
  }

  setRendererCallback(cb: (channel: string, data: unknown) => void) {
    this.rendererCallback = cb;
  }

  getRendererCallback(): ((channel: string, data: unknown) => void) | null {
    return this.rendererCallback;
  }

  getLLMClient(): LLMClient | null {
    return this.llmClient;
  }

  /**
   * Register a tool handler.
   */
  register(handler: ToolHandler) {
    this.handlers.set(handler.definition.name, handler);
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
