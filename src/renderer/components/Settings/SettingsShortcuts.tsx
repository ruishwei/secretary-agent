import React, { useState, useCallback } from "react";
import { useStore } from "../../store";
import { useI18n } from "../../i18n/useI18n";

const keyLabels: Record<string, string> = {
  Control: "Ctrl",
  Alt: "Alt",
  Shift: "Shift",
  Meta: "Meta",
};

function formatKeys(combo: string): string {
  return combo
    .split("+")
    .map((k) => {
      const trimmed = k.trim();
      return keyLabels[trimmed] || trimmed;
    })
    .join("+");
}

export function SettingsShortcuts() {
  const { t } = useI18n();
  const shortcuts = useStore((s) => s.settings.shortcuts);
  const updateSettings = useStore((s) => s.updateSettings);
  const [recording, setRecording] = useState(false);
  const [tempKeys, setTempKeys] = useState<string[]>([]);

  const saveShortcut = useCallback(
    (combo: string) => {
      updateSettings({ shortcuts: { ...shortcuts, voiceInput: combo } });
      window.electronAPI?.updateSettings({ shortcuts: { ...shortcuts, voiceInput: combo } });
    },
    [shortcuts, updateSettings],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Enter" && tempKeys.length > 0) {
        const combo = [...tempKeys].join("+");
        saveShortcut(combo);
        setRecording(false);
        setTempKeys([]);
        return;
      }
      if (e.key === "Escape") {
        setRecording(false);
        setTempKeys([]);
        return;
      }
      const parts = new Set<string>();
      if (e.ctrlKey) parts.add("Ctrl");
      if (e.altKey) parts.add("Alt");
      if (e.shiftKey) parts.add("Shift");
      if (e.metaKey) parts.add("Meta");
      if (!["Control", "Alt", "Shift", "Meta"].includes(e.key)) {
        parts.add(e.key.length === 1 ? e.key.toUpperCase() : e.key);
      }
      setTempKeys(Array.from(parts));
    },
    [tempKeys, saveShortcut],
  );

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-gray-200">
        {t("settings.shortcuts.title")}
      </h3>

      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300">
          {t("settings.shortcuts.voiceInput")}
        </span>
        <input
          type="text"
          readOnly
          value={recording ? tempKeys.join("+") || "..." : formatKeys(shortcuts.voiceInput)}
          onKeyDown={handleKeyDown}
          onFocus={() => setRecording(true)}
          onBlur={() => {
            setRecording(false);
            setTempKeys([]);
          }}
          className={`w-36 bg-gray-800 border text-sm rounded px-3 py-1 text-center outline-none transition-colors ${
            recording
              ? "border-blue-500 text-gray-100"
              : "border-gray-700 text-gray-300 cursor-pointer hover:border-gray-500"
          }`}
          placeholder="Ctrl+D"
        />
      </div>

      <p className="text-xs text-gray-500">
        {t("settings.shortcuts.recordHint")}
      </p>
    </div>
  );
}
