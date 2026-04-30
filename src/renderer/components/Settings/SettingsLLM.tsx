import React, { useState, useEffect } from "react";
import { useStore } from "../../store";
import { useI18n } from "../../i18n/useI18n";
import type { AppSettings } from "../../../shared/types";

interface Props {
  settings: AppSettings;
  onChange: (partial: Partial<AppSettings>) => void;
}

export function SettingsLLM({ settings, onChange }: Props) {
  const { t } = useI18n();
  const [local, setLocal] = useState(settings.llm);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setLocal(settings.llm); }, [settings.llm]);

  const handleSave = () => {
    onChange({ llm: local });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const update = (k: string, v: string | number | undefined) => setLocal((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-500">{t("settings.llm.provider")}</label>
        <select
          value={local.provider}
          onChange={(e) => update("provider", e.target.value)}
          className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
        >
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="openai">OpenAI</option>
        </select>
      </div>
      <div>
        <label className="text-xs text-gray-500">{t("settings.llm.apiKey")}</label>
        <input
          type="password"
          value={local.apiKey}
          onChange={(e) => update("apiKey", e.target.value)}
          placeholder="sk-..."
          className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500">{t("settings.llm.model")}</label>
        <input
          type="text"
          value={local.model}
          onChange={(e) => update("model", e.target.value)}
          className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500">{t("settings.llm.baseUrl")}</label>
        <input
          type="text"
          value={local.baseUrl || ""}
          onChange={(e) => update("baseUrl", e.target.value || undefined)}
          placeholder="https://api.deepseek.com"
          className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500">{t("settings.llm.maxTokens")}</label>
        <input
          type="number"
          value={local.maxTokens}
          onChange={(e) => update("maxTokens", parseInt(e.target.value) || 4096)}
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
