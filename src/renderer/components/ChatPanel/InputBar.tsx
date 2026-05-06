import React, { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import { ModelSelector } from "./ModelSelector";

export interface Attachment {
  name: string;
  dataUrl: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string, attachments?: Attachment[]) => void;
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if ((value.trim() || attachments.length > 0) && !isStreaming) {
          onSend(value, attachments.length > 0 ? attachments : undefined);
        }
      }
    },
    [value, attachments, isStreaming, onSend]
  );

  // Paste interception for images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems: DataTransferItem[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        imageItems.push(items[i]);
      }
    }
    if (imageItems.length > 0) {
      e.preventDefault();
      for (const item of imageItems) {
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = () => {
          setAttachments((prev) => [
            ...prev,
            { name: `paste-${Date.now()}.png`, dataUrl: reader.result as string },
          ]);
        };
        reader.readAsDataURL(blob);
      }
    }
  }, []);

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
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;
      const reader = new FileReader();
      reader.onload = () => {
        setAttachments((prev) => [
          ...prev,
          { name: file.name, dataUrl: reader.result as string },
        ]);
      };
      reader.readAsDataURL(file);
    }
    // Reset so the same file can be picked again
    e.target.value = "";
  }, []);

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleSendClick = useCallback(() => {
    if ((!value.trim() && attachments.length === 0) || isStreaming) return;
    onSend(value, attachments.length > 0 ? attachments : undefined);
    setAttachments([]);
  }, [value, attachments, isStreaming, onSend]);

  const btnBase =
    "p-1.5 rounded transition-colors text-gray-400 hover:text-gray-200 hover:bg-gray-700 flex-shrink-0";

  return (
    <div className="border-t border-gray-800">
      {/* Attachment chips */}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-2 pt-2">
          {attachments.map((att, i) => (
            <div key={i} className="relative group">
              <img
                src={att.dataUrl}
                alt={att.name}
                className="h-10 w-10 rounded object-cover border border-gray-700"
              />
              <button
                onClick={() => handleRemoveAttachment(i)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-800 border border-gray-600 text-gray-400 hover:text-white hover:bg-red-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-2.5 h-2.5">
                  <path fillRule="evenodd" d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Main input area */}
      <div className="px-2 pt-2">
        <textarea
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={isStreaming ? "Queue another task (agent is working)..." : "Type a command or /skill-name..."}
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

        {/* Right group: Model + Voice + Send */}
        <div className="flex items-center gap-1">
          <ModelSelector />
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
              onClick={handleSendClick}
              disabled={!value.trim() && attachments.length === 0}
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
