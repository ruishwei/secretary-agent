import React from "react";
import { useStore } from "../../store";

export function AgentThinking() {
  const agentActions = useStore((s) => s.agentActions);
  const isStreaming = useStore((s) => s.isStreaming);

  if (!isStreaming || agentActions.length === 0) {
    return null;
  }

  const running = agentActions.filter((a) => a.status === "running");
  if (running.length === 0) return null;

  return (
    <div className="border-b border-gray-800 bg-gray-900/60 px-3 py-1.5">
      <div className="flex items-center space-x-2 text-xs">
        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
        <span className="text-gray-400">Executing:</span>
        {running.map((a) => (
          <span key={a.toolCallId} className="text-blue-400 font-mono font-medium">
            {a.tool}
          </span>
        ))}
      </div>
    </div>
  );
}
