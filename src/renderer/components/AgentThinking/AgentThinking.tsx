import React from "react";
import { useStore } from "../../store";

export function AgentThinking() {
  const agentThinking = useStore((s) => s.agentThinking);
  const agentActions = useStore((s) => s.agentActions);
  const isStreaming = useStore((s) => s.isStreaming);

  if (!isStreaming && !agentThinking && agentActions.length === 0) {
    return null;
  }

  return (
    <div className="border-b border-gray-800 bg-gray-900/50">
      {/* Current plan */}
      {agentThinking && (
        <div className="px-3 py-2 border-b border-gray-800/50">
          <div className="text-xs text-gray-400 font-medium mb-1">Plan</div>
          <div className="text-xs text-gray-300">{agentThinking}</div>
        </div>
      )}

      {/* Recent tool actions */}
      {agentActions.length > 0 && (
        <div className="px-3 py-2 max-h-[120px] overflow-y-auto">
          <div className="text-xs text-gray-400 font-medium mb-1">Actions</div>
          {agentActions.map((action) => (
            <div key={action.toolCallId} className="flex items-center space-x-2 text-xs py-0.5">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  action.status === "running"
                    ? "bg-blue-400 animate-pulse"
                    : action.status === "success"
                    ? "bg-green-400"
                    : "bg-red-400"
                }`}
              />
              <span className="text-gray-400 font-mono">{action.tool}</span>
              <span className="text-gray-600 truncate">
                {JSON.stringify(action.args).substring(0, 60)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
