import React, { useState, useRef, useEffect, useCallback } from "react";
import { useStore } from "../../store";

export function ModelSelector() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const configs = settings.llmConfigs;
  const activeId = settings.activeLlmConfigId;
  const activeConfig = configs.find((c) => c.id === activeId);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleSelect = useCallback((id: string) => {
    updateSettings({ activeLlmConfigId: id });
    window.electronAPI?.updateSettings({ activeLlmConfigId: id });
    setOpen(false);
  }, [updateSettings]);

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-1.5 py-1 rounded text-xs text-gray-400 hover:text-gray-200 hover:bg-gray-700 transition-colors max-w-[120px]"
        title={activeConfig?.name || "Select model"}
      >
        <span className="truncate">{activeConfig?.name || "Select"}</span>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 flex-shrink-0">
          <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06z" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full mb-1 right-0 w-56 bg-gray-900 border border-gray-700 rounded shadow-lg z-50 max-h-48 overflow-y-auto">
          {configs.map((cfg) => (
            <button
              key={cfg.id}
              onClick={() => handleSelect(cfg.id)}
              className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-gray-800 flex items-center justify-between ${
                cfg.id === activeId ? "text-gray-100" : "text-gray-400"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate">{cfg.name}</div>
                <div className="text-[10px] text-gray-500">
                  {cfg.provider === "anthropic" ? "Anthropic" : "OpenAI"} · {cfg.model}
                </div>
              </div>
              {cfg.id === activeId && (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-green-400 flex-shrink-0 ml-2">
                  <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207z" />
                </svg>
              )}
            </button>
          ))}
          {configs.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">No models configured</div>
          )}
        </div>
      )}
    </div>
  );
}
