import React from "react";
import { useStore } from "../../store";

export function AgentThinking() {
  const agentActions = useStore((s) => s.agentActions);
  const planItems = useStore((s) => s.planItems);
  const isStreaming = useStore((s) => s.isStreaming);

  const running = agentActions.filter((a) => a.status === "running");
  const hasPlan = planItems.length > 0;

  if (!isStreaming && !hasPlan) return null;

  return (
    <div className="border-b border-gray-800 bg-gray-900/60">
      {/* Currently executing tools */}
      {running.length > 0 && (
        <div className="flex items-center space-x-2 text-xs px-3 py-1.5">
          <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
          <span className="text-gray-400">Executing:</span>
          {running.map((a) => (
            <span key={a.toolCallId} className="text-blue-400 font-mono font-medium">
              {a.tool}
            </span>
          ))}
        </div>
      )}

      {/* Plan items with checkmarks */}
      {hasPlan && (
        <div className="px-3 py-2">
          <div className="text-xs text-gray-500 font-medium mb-1.5 uppercase tracking-wide">Plan</div>
          <ul className="space-y-1">
            {planItems.map((item) => {
              const isCompleted = item.status === "completed";
              const isInProgress = item.status === "in_progress";
              return (
                <li
                  key={item.id}
                  className={`flex items-start gap-2 text-xs ${
                    isCompleted ? "line-through text-gray-600" : "text-gray-300"
                  }`}
                >
                  <span
                    className={`flex-shrink-0 mt-0.5 ${
                      isCompleted
                        ? "text-green-500"
                        : isInProgress
                        ? "text-blue-400 animate-pulse"
                        : "text-gray-600"
                    }`}
                  >
                    {isCompleted ? "✓" : isInProgress ? "●" : "○"}
                  </span>
                  <span className="leading-relaxed">{item.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
