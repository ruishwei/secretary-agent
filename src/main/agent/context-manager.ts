import type { LLMMessage, LLMContentBlock } from "./llm-client";
import { CONTEXT_COMPACTION_THRESHOLD } from "../../shared/constants";

/**
 * Manages the conversation context: message history, token budgeting,
 * and context compaction when approaching limits.
 */
export class ContextManager {
  private systemPrompt = "";
  private messages: LLMMessage[] = [];
  private estimatedTokens = 0;
  private maxTokens: number;

  // Approximate tokens per character (very rough heuristic for English/Chinese mix)
  private static readonly CHARS_PER_TOKEN = 2.5;

  constructor(maxTokens = 8000) {
    this.maxTokens = maxTokens;
  }

  setSystemPrompt(prompt: string) {
    this.systemPrompt = prompt;
  }

  getSystemPrompt(): string {
    return this.systemPrompt;
  }

  addMessage(message: LLMMessage) {
    this.messages.push(message);
    this.estimatedTokens += this.estimateTokens(message);
  }

  getMessages(): LLMMessage[] {
    return this.messages;
  }

  /**
   * Add a user text message, optionally with attached images.
   */
  addUserMessage(text: string, images?: string[]) {
    if (images && images.length > 0) {
      const blocks: LLMContentBlock[] = [{ type: "text", text }];
      for (const src of images) {
        blocks.push({ type: "image", source: src });
      }
      this.addMessage({ role: "user", content: blocks });
    } else {
      this.addMessage({ role: "user", content: text });
    }
  }

  /**
   * Add an assistant response with optional tool calls and thinking blocks.
   */
  addAssistantResponse(
    text: string,
    toolCalls?: Array<{ id: string; name: string; input: Record<string, unknown> }>,
    thinkingBlocks?: Array<{ thinking: string; signature?: string }>
  ) {
    const blocks: LLMContentBlock[] = [];
    if (thinkingBlocks) {
      for (const tb of thinkingBlocks) {
        blocks.push({ type: "thinking", thinking: tb.thinking, signature: tb.signature });
      }
    }
    if (text) {
      blocks.push({ type: "text", text });
    }
    if (toolCalls && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      }
    }
    if (blocks.length > 0) {
      this.addMessage({ role: "assistant", content: blocks });
    } else {
      this.addMessage({ role: "assistant", content: text });
    }
  }

  /**
   * Add tool results to the conversation.
   */
  addToolResults(results: Array<{ toolCallId: string; name: string; result: string; isError?: boolean }>) {
    const blocks: LLMContentBlock[] = results.map((r) => ({
      type: "tool_result" as const,
      tool_use_id: r.toolCallId,
      content: r.result,
      is_error: r.isError,
    }));
    this.addMessage({ role: "user", content: blocks });
  }

  /**
   * Check if compaction is needed and compress old messages.
   */
  shouldCompact(): boolean {
    const usage = this.estimatedTokens / this.maxTokens;
    return usage >= CONTEXT_COMPACTION_THRESHOLD;
  }

  /**
   * Compact the context by summarizing old messages.
   * Keeps the system prompt, recent messages, and replaces older ones with a summary.
   */
  compact(): string {
    const keepRecent = 6; // Keep last 3 user-assistant pairs
    if (this.messages.length <= keepRecent) {
      return "";
    }

    const oldMessages = this.messages.slice(0, -keepRecent);
    const recentMessages = this.messages.slice(-keepRecent);

    // Build a summary of old messages
    const summaryParts: string[] = [];
    for (const msg of oldMessages) {
      const content = typeof msg.content === "string" ? msg.content : "";
      if (msg.role === "user" && content) {
        summaryParts.push(`User: ${content.substring(0, 200)}`);
      } else if (msg.role === "assistant" && content) {
        summaryParts.push(`Assistant: ${content.substring(0, 200)}`);
      }
    }

    const summary = `[Earlier conversation summary]:\n${summaryParts.join("\n")}\n---`;

    // Replace old messages with a single summary message
    this.messages = [
      { role: "user", content: summary },
      ...recentMessages,
    ];

    // Recalculate tokens
    this.estimatedTokens = this.estimateTokens({ role: "system", content: this.systemPrompt });
    for (const msg of this.messages) {
      this.estimatedTokens += this.estimateTokens(msg);
    }

    return summary;
  }

  /**
   * Reset all context.
   */
  clear() {
    this.messages = [];
    this.estimatedTokens = 0;
  }

  getTokenUsage(): { estimated: number; max: number; ratio: number } {
    return {
      estimated: this.estimatedTokens,
      max: this.maxTokens,
      ratio: this.estimatedTokens / this.maxTokens,
    };
  }

  private estimateTokens(message: LLMMessage): number {
    if (typeof message.content === "string") {
      return Math.ceil(message.content.length / ContextManager.CHARS_PER_TOKEN);
    }
    let total = 0;
    for (const block of message.content) {
      total += Math.ceil(
        ((block.text || block.content || JSON.stringify(block.input || {}))).length /
          ContextManager.CHARS_PER_TOKEN
      );
    }
    return total;
  }
}
