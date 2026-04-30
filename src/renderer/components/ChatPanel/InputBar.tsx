import React, { useCallback, useEffect, useRef } from "react";
import { useStore } from "../../store";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => void;
  onAbort: () => void;
  isStreaming: boolean;
  onSettingsClick: () => void;
}

function parseShortcut(combo: string): { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean; key: string } {
  const parts = combo.split("+").map((s) => s.trim());
  return {
    ctrl: parts.includes("Ctrl"),
    alt: parts.includes("Alt"),
    shift: parts.includes("Shift"),
    meta: parts.includes("Meta"),
    key: parts.find((p) => !["Ctrl", "Alt", "Shift", "Meta"].includes(p)) || "",
  };
}

export function InputBar({ value, onChange, onSend, onAbort, isStreaming, onSettingsClick }: Props) {
  const voiceShortcut = useStore((s) => s.settings.shortcuts.voiceInput);
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

  // Voice input global shortcut
  useEffect(() => {
    const sc = parseShortcut(voiceShortcut);
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.ctrlKey === sc.ctrl &&
        e.altKey === sc.alt &&
        e.shiftKey === sc.shift &&
        e.metaKey === sc.meta &&
        e.key.toLowerCase() === sc.key.toLowerCase()
      ) {
        e.preventDefault();
        // Voice recording will be triggered here
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [voiceShortcut]);

  const handleAttachClick = useCallback(() => {
    // TODO: file attachment
  }, []);

  const btnBase =
    "p-1.5 rounded transition-colors text-gray-400 hover:text-gray-200 hover:bg-gray-700 flex-shrink-0";

  return (
    <div className="border-t border-gray-800">
      {/* Main input area */}
      <div className="px-2 pt-2">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isStreaming ? "Agent is working..." : "Type a command or /skill-name..."}
          disabled={isStreaming}
          rows={2}
          className="w-full bg-transparent text-gray-100 rounded px-2 py-1 text-sm resize-none focus:outline-none placeholder-gray-500 disabled:opacity-50"
        />
      </div>

      {/* Divider */}
      <div className="mx-2 border-t border-gray-700" />

      {/* Bottom action bar */}
      <div className="flex items-center justify-between px-2 pb-2 pt-1">
        {/* Left group: Attach + Settings */}
        <div className="flex items-center gap-1">
          <button
            onClick={handleAttachClick}
            className={btnBase}
            title="Attach files"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <button
            onClick={onSettingsClick}
            className={btnBase}
            title="Settings"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <circle cx="4" cy="12" r="2" />
              <circle cx="12" cy="10" r="2" />
              <circle cx="20" cy="14" r="2" />
            </svg>
          </button>
        </div>

        {/* Right group: Voice + Send */}
        <div className="flex items-center gap-1">
          <button
            className={btnBase}
            title={`Voice Input (${voiceShortcut})`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
          {isStreaming ? (
            <button
              onClick={onAbort}
              className="p-1.5 rounded transition-colors bg-red-700 hover:bg-red-600 text-white flex-shrink-0"
              title="Abort"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <rect x="2" y="2" width="12" height="12" rx="1" />
              </svg>
            </button>
          ) : (
            <button
              onClick={() => value.trim() && onSend(value)}
              disabled={!value.trim()}
              className="p-1.5 rounded transition-colors text-gray-400 hover:text-gray-200 hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
              title="Send (Enter)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
