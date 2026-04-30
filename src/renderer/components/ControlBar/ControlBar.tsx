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
          className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded transition-colors"
          title="Settings"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4"
          >
            <path
              fillRule="evenodd"
              d="M7.84 1.804A1 1 0 018.82 1h2.36a1 1 0 01.98.804l.331 1.652a6.993 6.993 0 011.929 1.115l1.598-.54a1 1 0 011.186.447l1.18 2.044a1 1 0 01-.205 1.251l-1.267 1.113a7.047 7.047 0 010 2.228l1.267 1.113a1 1 0 01.205 1.251l-1.18 2.044a1 1 0 01-1.186.447l-1.598-.54a6.993 6.993 0 01-1.929 1.115l-.33 1.652a1 1 0 01-.98.804H8.82a1 1 0 01-.98-.804l-.331-1.652a6.993 6.993 0 01-1.929-1.115l-1.598.54a1 1 0 01-1.186-.447l-1.18-2.044a1 1 0 01.205-1.251l1.267-1.113a7.047 7.047 0 010-2.228L1.821 7.773a1 1 0 01-.205-1.251l1.18-2.044a1 1 0 011.186-.447l1.598.54A6.993 6.993 0 017.51 3.456l.33-1.652zM10 13a3 3 0 100-6 3 3 0 000 6z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
