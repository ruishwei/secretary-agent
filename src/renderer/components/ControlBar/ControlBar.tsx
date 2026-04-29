import React from "react";
import { useStore } from "../../store";

interface Props {
  onOpenSettings: () => void;
}

export function ControlBar({ onOpenSettings }: Props) {
  const isStreaming = useStore((s) => s.isStreaming);

  return (
    <div className="h-10 bg-gray-900 border-b border-gray-800 flex items-center px-4 justify-between select-none">
      <div className="flex items-center space-x-3">
        <span className="text-sm font-semibold text-gray-300">Browser Secretary</span>
        {isStreaming && (
          <span className="text-xs text-blue-400 animate-pulse">Working...</span>
        )}
      </div>

      <div className="flex items-center space-x-2">
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
