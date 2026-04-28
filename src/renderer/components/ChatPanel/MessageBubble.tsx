import React from "react";
import type { ChatMessage } from "../../../shared/types";

interface Props {
  message: ChatMessage;
}

export function MessageBubble({ message }: Props) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  if (isSystem) {
    return (
      <div className="text-center text-xs text-gray-600 italic py-1">
        {message.content}
      </div>
    );
  }

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
          isUser
            ? "bg-blue-600 text-white rounded-br-sm"
            : "bg-gray-800 text-gray-100 rounded-bl-sm"
        }`}
      >
        <div className="whitespace-pre-wrap break-words">{message.content || "..."}</div>
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mt-2 pt-2 border-t border-gray-700">
            {message.toolCalls.map((tc) => (
              <div key={tc.toolCallId} className="text-xs text-gray-400">
                <span className="text-blue-400">{tc.tool}</span>
                {tc.success ? " ✓" : tc.error ? " ✗" : " ..."}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
