import React, { useState } from "react";
import { useStore } from "../../store";
import type { AppSettings } from "../../../shared/types";

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsPanel({ isOpen, onClose }: Props) {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const [localSettings, setLocalSettings] = useState<AppSettings>({ ...settings });

  if (!isOpen) return null;

  const handleSave = () => {
    updateSettings(localSettings);
    // Also persist to main process
    (window as any).electronAPI?.updateSettings(localSettings);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-[560px] max-h-[80vh] flex flex-col">
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">Settings</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-lg leading-none"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* LLM Settings */}
          <fieldset className="border border-gray-800 rounded p-3">
            <legend className="text-xs text-gray-400 font-medium px-1">LLM</legend>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500">Provider</label>
                <select
                  value={localSettings.llm.provider}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      llm: { ...localSettings.llm, provider: e.target.value as "anthropic" | "openai" },
                    })
                  }
                  className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
                >
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">API Key</label>
                <input
                  type="password"
                  value={localSettings.llm.apiKey}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      llm: { ...localSettings.llm, apiKey: e.target.value },
                    })
                  }
                  placeholder="sk-..."
                  className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Model</label>
                <input
                  type="text"
                  value={localSettings.llm.model}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      llm: { ...localSettings.llm, model: e.target.value },
                    })
                  }
                  className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
                />
              </div>
            </div>
          </fieldset>

          {/* Voice Settings */}
          <fieldset className="border border-gray-800 rounded p-3">
            <legend className="text-xs text-gray-400 font-medium px-1">Voice</legend>
            <div className="space-y-2">
              <div>
                <label className="text-xs text-gray-500">Provider</label>
                <select
                  value={localSettings.voice.provider}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      voice: { ...localSettings.voice, provider: e.target.value as "whisper" | "webspeech" | "auto" },
                    })
                  }
                  className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
                >
                  <option value="auto">Auto (Whisper → Web Speech)</option>
                  <option value="whisper">Whisper API</option>
                  <option value="webspeech">Web Speech API</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Language</label>
                <input
                  type="text"
                  value={localSettings.voice.language}
                  onChange={(e) =>
                    setLocalSettings({
                      ...localSettings,
                      voice: { ...localSettings.voice, language: e.target.value },
                    })
                  }
                  placeholder="zh-CN"
                  className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
                />
              </div>
            </div>
          </fieldset>
        </div>

        <div className="px-4 py-3 border-t border-gray-800 flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
