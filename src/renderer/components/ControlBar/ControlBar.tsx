import React from "react";
import { useStore } from "../../store";

interface Props {
  onOpenSettings: () => void;
}

export function ControlBar({ onOpenSettings }: Props) {
  const mode = useStore((s) => s.mode);
  const isStreaming = useStore((s) => s.isStreaming);

  const handleTakeOver = () => {
    (window as any).electronAPI?.takeOver();
  };

  const handleHandBack = () => {
    (window as any).electronAPI?.handBack();
  };

  const modeLabel = {
    ai: { text: "AI Control", color: "bg-blue-600" },
    user: { text: "Manual Control", color: "bg-green-600" },
    review: { text: "Review Required", color: "bg-yellow-600" },
  }[mode];

  return (
    <div className="h-10 bg-gray-900 border-b border-gray-800 flex items-center px-4 justify-between select-none">
      <div className="flex items-center space-x-3">
        <span className="text-sm font-semibold text-gray-300">Browser Secretary</span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${modeLabel?.color}`}>
          {modeLabel?.text}
        </span>
        {isStreaming && (
          <span className="text-xs text-blue-400 animate-pulse">Working...</span>
        )}
      </div>

      <div className="flex items-center space-x-2">
        {mode === "ai" ? (
          <button
            onClick={handleTakeOver}
            className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
          >
            Take Over
          </button>
        ) : mode === "user" ? (
          <button
            onClick={handleHandBack}
            className="px-3 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded transition-colors"
          >
            Hand Back to AI
          </button>
        ) : null}
        <button
          onClick={onOpenSettings}
          className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors"
          title="Settings"
        >
          Settings
        </button>
      </div>
    </div>
  );
}
