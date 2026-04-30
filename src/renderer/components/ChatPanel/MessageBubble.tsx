import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ChatMessage } from "../../../shared/types";

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="text-center text-xs text-gray-500 italic py-1">
        {message.content}
      </div>
    );
  }

  const hasBlocks = message.blocks && message.blocks.length > 0;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-gray-800 text-gray-100 rounded-bl-sm"
        }`}
      >
        {/* Blocks rendered in natural interleaved order — reasoning → tool → result → reasoning → tool → result */}
        {message.blocks?.map((block, i) => {
          switch (block.type) {
            case "thinking":
              return (
                <ThinkingSection
                  key={i}
                  thinking={block.thinking}
                  reasoning={block.reasoning}
                />
              );
            case "tool-call":
              return (
                <ToolCallCard
                  key={block.toolCallId}
                  tool={block.tool}
                  args={block.args}
                  status={block.status}
                  result={block.result}
                  durationMs={block.durationMs}
                />
              );
            default:
              return null;
          }
        })}

        {/* Markdown text content */}
        {message.content && (
          <div className={isUser ? "text-white" : "text-gray-100"}>
            {isUser ? (
              <div className="whitespace-pre-wrap break-words">{message.content}</div>
            ) : (
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* Pulse only when streaming, no content, no blocks yet */}
        {!isUser && !message.content && !hasBlocks && (
          <div className="flex items-center space-x-2 text-gray-400">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            <span>Thinking...</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Collapsible thinking section with streaming reasoning and structured plan display */
function ThinkingSection({ thinking, reasoning }: { thinking: string; reasoning?: string }) {
  const [open, setOpen] = useState(false);
  if (!thinking && !reasoning) return null;

  // Parse numbered/bullet plan items from reasoning for structured display
  const planLines = (reasoning || thinking)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // Detect if content looks like a plan (numbered or bulleted items)
  const isStructuredPlan = planLines.some(
    (l) => /^\d+[\.\)]\s/.test(l) || /^[-*•]\s/.test(l) || /^Step\s\d/i.test(l)
  );

  return (
    <div className="mb-2 text-xs thinking-block">
      <button
        className="w-full flex items-center gap-2 text-left cursor-pointer hover:opacity-80 select-none"
        onClick={() => setOpen(!open)}
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
          reasoning ? "bg-purple-400 animate-pulse" : "bg-gray-500"
        }`} />
        <span className="text-gray-400 flex-1 truncate">
          {open ? "Hide reasoning" : reasoning
            ? `Reasoning: ${reasoning.replace(/\s+/g, " ").substring(0, 60)}...`
            : `Plan: ${thinking.replace(/\s+/g, " ").substring(0, 60)}...`}
        </span>
        <span className="text-gray-500 text-[10px]">{open ? "-" : "+"}</span>
      </button>

      {open && (
        <div className="mt-1 p-2 bg-gray-900/50 rounded border border-gray-700/50 text-gray-400 whitespace-pre-wrap max-h-64 overflow-y-auto">
          {isStructuredPlan ? (
            <ul className="space-y-0.5">
              {planLines.map((line, i) => {
                const isCompleted = line.startsWith("~") || line.startsWith("[x]");
                const cleanLine = line.replace(/^[~\[x\]\s]+/, "").trim();
                return (
                  <li key={i} className={`flex items-start gap-2 ${isCompleted ? "line-through text-gray-600" : ""}`}>
                    <span className={`flex-shrink-0 mt-0.5 ${
                      isCompleted ? "text-green-500" : "text-purple-400"
                    }`}>
                      {isCompleted ? "✓" : "○"}
                    </span>
                    <span>{cleanLine}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <>{reasoning || thinking}</>
          )}
        </div>
      )}
    </div>
  );
}

/** Tool call execution card */
function ToolCallCard({
  tool,
  args,
  status,
  result,
  durationMs,
}: {
  tool: string;
  args: Record<string, unknown>;
  status: "running" | "success" | "error";
  result?: string;
  durationMs?: number;
}) {
  const [expanded, setExpanded] = useState(status === "running");

  const statusColor =
    status === "running"
      ? "text-blue-400"
      : status === "success"
      ? "text-green-400"
      : "text-red-400";
  const statusBg =
    status === "running"
      ? "bg-blue-500/10 border-blue-500/30"
      : status === "success"
      ? "bg-green-500/10 border-green-500/30"
      : "bg-red-500/10 border-red-500/30";

  return (
    <div className={`mb-2 rounded border text-xs ${statusBg}`}>
      <button
        className="w-full flex items-center px-2 py-1.5 text-left hover:opacity-80"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`inline-block w-3 h-3 rounded-full mr-2 flex-shrink-0 ${
          status === "running" ? "bg-blue-400 animate-pulse" :
          status === "success" ? "bg-green-400" : "bg-red-400"
        }`} />
        <span className="text-gray-300 font-mono font-medium truncate">{tool}</span>
        {status !== "running" && durationMs != null && (
          <span className="text-gray-500 text-[10px] ml-2 flex-shrink-0">
            {(durationMs / 1000).toFixed(1)}s
          </span>
        )}
        <span className="ml-auto text-gray-500 text-[10px] flex-shrink-0">
          {expanded ? "-" : "+"}
        </span>
      </button>

      {expanded && (
        <div className="px-2 pb-2 border-t border-gray-700/30">
          {Object.keys(args).length > 0 && (
            <div className="mt-1.5">
              <div className="text-gray-500 mb-0.5">Args:</div>
              <pre className="p-1.5 bg-gray-900/50 rounded text-gray-400 overflow-x-auto text-[11px] max-h-24 overflow-y-auto">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}

          {result && (
            <div className="mt-1.5">
              <div className={`mb-0.5 ${status === "success" ? "text-green-500" : "text-red-500"}`}>
                {status === "success" ? "Result:" : "Error:"}
              </div>
              <pre className="p-1.5 bg-gray-900/50 rounded text-gray-400 overflow-x-auto text-[11px] max-h-32 overflow-y-auto whitespace-pre-wrap">
                {result.length > 500 ? result.substring(0, 500) + "..." : result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
