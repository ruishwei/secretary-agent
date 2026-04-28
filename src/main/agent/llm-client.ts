import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { ToolDefinition } from "../../shared/tool-schemas";
import { Logger } from "../utils/logger";

const logger = new Logger("LLM");

export interface LLMConfig {
  provider: "anthropic" | "openai";
  apiKey: string;
  model: string;
  maxTokens: number;
}

export interface LLMMessage {
  role: "user" | "assistant" | "system";
  content: string | LLMContentBlock[];
}

export interface LLMContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

export interface LLMResponse {
  type: "text" | "tool_use" | "mixed";
  text?: string;
  toolCalls?: LLMToolCall[];
  stopReason: string;
}

export interface LLMToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

function toAnthropicMessages(messages: LLMMessage[]) {
  return messages.map((m) => {
    if (typeof m.content === "string") {
      return { role: m.role as "user" | "assistant", content: m.content };
    }
    const content = m.content.map((block) => {
      switch (block.type) {
        case "text":
          return { type: "text" as const, text: block.text! };
        case "tool_use":
          return {
            type: "tool_use" as const,
            id: block.id!,
            name: block.name!,
            input: block.input!,
          };
        case "tool_result":
          return {
            type: "tool_result" as const,
            tool_use_id: block.tool_use_id!,
            content: block.content!,
            is_error: block.is_error,
          };
        default:
          return { type: "text" as const, text: "" };
      }
    });
    return { role: m.role as "user" | "assistant", content };
  });
}

function toOpenAIMessages(messages: LLMMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      result.push({ role: "system", content: typeof m.content === "string" ? m.content : "" });
      continue;
    }
    if (typeof m.content === "string") {
      if (m.role === "user") {
        result.push({ role: "user", content: m.content });
      } else {
        result.push({ role: "assistant", content: m.content });
      }
    } else {
      const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
      for (const block of m.content) {
        if (block.type === "text" && block.text) {
          parts.push({ type: "text", text: block.text });
        } else if (block.type === "tool_use") {
          result.push({
            role: "assistant",
            tool_calls: [
              {
                id: block.id!,
                type: "function" as const,
                function: { name: block.name!, arguments: JSON.stringify(block.input) },
              },
            ],
          });
        } else if (block.type === "tool_result") {
          result.push({
            role: "tool",
            tool_call_id: block.tool_use_id!,
            content: block.content!,
          });
        }
      }
      if (parts.length > 0) {
        // OpenAI SDK has strict typing for message content; use cast
        result.push({ role: m.role, content: parts } as any);
      }
    }
  }
  return result;
}

function anthropicTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
}

function openaiTools(tools: ToolDefinition[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));
}

export class LLMClient {
  private anthropic: Anthropic | null = null;
  private openai: OpenAI | null = null;
  private config: LLMConfig;

  constructor(config: LLMConfig) {
    this.config = config;
    this.initClient();
  }

  updateConfig(config: Partial<LLMConfig>) {
    this.config = { ...this.config, ...config };
    this.initClient();
  }

  private initClient() {
    if (this.config.provider === "anthropic" && this.config.apiKey) {
      this.anthropic = new Anthropic({ apiKey: this.config.apiKey });
    }
    if (this.config.provider === "openai" && this.config.apiKey) {
      this.openai = new OpenAI({ apiKey: this.config.apiKey });
    }
  }

  async *sendMessage(
    systemPrompt: string,
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options?: { signal?: AbortSignal }
  ): AsyncGenerator<LLMResponse> {
    if (this.config.provider === "anthropic" && this.anthropic) {
      yield* this.sendAnthropic(systemPrompt, messages, tools, options);
    } else if (this.config.provider === "openai" && this.openai) {
      yield* this.sendOpenAI(systemPrompt, messages, tools, options);
    } else {
      throw new Error(
        `LLM provider "${this.config.provider}" is not configured. Check API key.`
      );
    }
  }

  private async *sendAnthropic(
    systemPrompt: string,
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options?: { signal?: AbortSignal }
  ): AsyncGenerator<LLMResponse> {
    const anthropicMessages = toAnthropicMessages(messages);
    const stream = this.anthropic!.messages.stream(
      {
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        system: systemPrompt,
        messages: anthropicMessages as any,
        tools: tools.length > 0 ? anthropicTools(tools) : undefined,
      },
      { signal: options?.signal }
    );

    let currentText = "";
    let currentToolCalls: Map<string, { name: string; input: string }> = new Map();

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          currentText += event.delta.text;
          yield { type: "text", text: currentText, stopReason: "streaming" };
        } else if (event.delta.type === "input_json_delta") {
          // Accumulate tool input JSON
          const existing = currentToolCalls.get(event.index.toString()) || {
            name: "",
            input: "",
          };
          existing.input += event.delta.partial_json;
          currentToolCalls.set(event.index.toString(), existing);
        }
      } else if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          currentToolCalls.set(event.index.toString(), {
            name: event.content_block.name,
            input: "",
          });
        }
      }
    }

    const finalMessage = await stream.finalMessage();
    const toolCalls: LLMToolCall[] = [];

    for (const block of finalMessage.content) {
      if (block.type === "tool_use") {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: (block.input as Record<string, unknown>) || {},
        });
      }
    }

    if (toolCalls.length > 0) {
      yield {
        type: currentText ? "mixed" : "tool_use",
        text: currentText || undefined,
        toolCalls,
        stopReason: "tool_use",
      };
    } else {
      yield { type: "text", text: currentText, stopReason: finalMessage.stop_reason || "end_turn" };
    }
  }

  private async *sendOpenAI(
    systemPrompt: string,
    messages: LLMMessage[],
    tools: ToolDefinition[],
    options?: { signal?: AbortSignal }
  ): AsyncGenerator<LLMResponse> {
    const openaiMessages = toOpenAIMessages(messages);
    if (systemPrompt) {
      openaiMessages.unshift({ role: "system", content: systemPrompt });
    }

    const stream = await this.openai!.chat.completions.create(
      {
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        messages: openaiMessages,
        tools: tools.length > 0 ? openaiTools(tools) : undefined,
        stream: true,
      },
      { signal: options?.signal }
    );

    let currentText = "";
    const toolCalls: Map<number, { id: string; name: string; input: string }> = new Map();

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (!delta) continue;

      if (delta.content) {
        currentText += delta.content;
        yield { type: "text", text: currentText, stopReason: "streaming" };
      }

      if (delta.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls.has(idx)) {
            toolCalls.set(idx, { id: tc.id || "", name: tc.function?.name || "", input: "" });
          }
          const existing = toolCalls.get(idx)!;
          if (tc.id) existing.id = tc.id;
          if (tc.function?.name) existing.name = tc.function.name;
          if (tc.function?.arguments) existing.input += tc.function.arguments;
        }
      }
    }

    const allToolCalls: LLMToolCall[] = [];
    for (const [, tc] of toolCalls) {
      if (tc.name) {
        allToolCalls.push({
          id: tc.id || `tool-${Date.now()}`,
          name: tc.name,
          input: tc.input ? JSON.parse(tc.input) : {},
        });
      }
    }

    if (allToolCalls.length > 0) {
      yield {
        type: currentText ? "mixed" : "tool_use",
        text: currentText || undefined,
        toolCalls: allToolCalls,
        stopReason: "tool_calls",
      };
    } else {
      yield { type: "text", text: currentText, stopReason: "stop" };
    }
  }
}
