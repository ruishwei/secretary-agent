import React, { useState, useEffect } from "react";
import { useI18n } from "../../i18n/useI18n";
import type { AppSettings } from "../../../shared/types";

interface Props {
  settings: AppSettings;
  onChange: (partial: Partial<AppSettings>) => void;
}

export function SettingsVoice({ settings, onChange }: Props) {
  const { t } = useI18n();
  const [local, setLocal] = useState(settings.voice);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setLocal(settings.voice); }, [settings.voice]);

  const handleSave = () => {
    onChange({ voice: local });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const update = (k: string, v: string) => setLocal((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-500">{t("settings.voice.provider")}</label>
        <select
          value={local.provider}
          onChange={(e) => update("provider", e.target.value)}
          className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
        >
          <option value="auto">Auto (Whisper → Web Speech)</option>
          <option value="whisper">Whisper API</option>
          <option value="webspeech">Web Speech API</option>
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-500">{t("settings.voice.language")}</label>
        <input
          type="text"
          value={local.language}
          onChange={(e) => update("language", e.target.value)}
          placeholder="zh-CN"
          className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500">{t("settings.voice.whisperApiKey")}</label>
        <input
          type="password"
          value={local.whisperApiKey}
          onChange={(e) => update("whisperApiKey", e.target.value)}
          placeholder="sk-..."
          className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
        />
      </div>
      <button
        onClick={handleSave}
        className={`px-4 py-1.5 text-xs rounded transition-colors ${
          saved ? "bg-green-700 text-white" : "bg-blue-600 hover:bg-blue-500 text-white"
        }`}
      >
        {saved ? "✓" : t("common.save")}
      </button>
    </div>
  );
}
