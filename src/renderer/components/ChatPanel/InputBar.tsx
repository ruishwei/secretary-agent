import React, { useCallback, useRef } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onAbort: () => void;
  isStreaming: boolean;
}

export function InputBar({ value, onChange, onSend, onAbort, isStreaming }: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (value.trim() && !isStreaming) {
          onSend(value);
        }
      }
    },
    [value, isStreaming, onSend]
  );

  const handleVoiceClick = useCallback(() => {
    // Phase 7: Voice recording will be implemented here
  }, []);

  return (
    <div className="border-t border-gray-800 p-3">
      <div className="flex items-end space-x-2">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? "Agent is working..." : "Type a command or /skill-name..."}
          disabled={isStreaming}
          rows={2}
          className="flex-1 bg-gray-800 text-gray-100 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
        />
        <div className="flex flex-col space-y-1">
          {isStreaming ? (
            <button
              onClick={onAbort}
              className="px-3 py-2 bg-red-700 hover:bg-red-600 text-white text-sm rounded-lg transition-colors"
              title="Abort"
            >
              ■
            </button>
          ) : (
            <button
              onClick={() => value.trim() && onSend(value)}
              disabled={!value.trim()}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Send (Enter)"
            >
              ↑
            </button>
          )}
          <button
            onClick={handleVoiceClick}
            className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 text-sm rounded-lg transition-colors"
            title="Voice Input"
          >
            🎤
          </button>
        </div>
      </div>
    </div>
  );
}
