import React, { useState, useEffect, useCallback } from "react";
import { useI18n } from "../../i18n/useI18n";
import type { AppSettings, LlmConfigEntry } from "../../../shared/types";

interface Props {
  settings: AppSettings;
  onChange: (partial: Partial<AppSettings>) => void;
}

function emptyConfig(): LlmConfigEntry {
  return {
    id: `cfg-${Date.now()}`,
    name: "",
    provider: "anthropic",
    apiKey: "",
    model: "",
    maxTokens: 4096,
    supportsVision: true,
  };
}

export function SettingsLLM({ settings, onChange }: Props) {
  const { t } = useI18n();
  const configs = settings.llmConfigs;
  const activeId = settings.activeLlmConfigId;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LlmConfigEntry | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saved, setSaved] = useState(false);

  // Select first config on mount if none selected
  useEffect(() => {
    if (!selectedId && configs.length > 0) {
      setSelectedId(configs[0].id);
      setDraft({ ...configs[0] });
      setIsNew(false);
    }
  }, [configs, selectedId]);

  const handleSelect = useCallback((id: string) => {
    const cfg = configs.find((c) => c.id === id);
    if (cfg) {
      setSelectedId(id);
      setDraft({ ...cfg });
      setIsNew(false);
    }
  }, [configs]);

  const handleAdd = useCallback(() => {
    const neu = emptyConfig();
    setSelectedId(neu.id);
    setDraft(neu);
    setIsNew(true);
  }, []);

  const handleSave = useCallback(() => {
    if (!draft) return;
    let updated: LlmConfigEntry[];
    if (isNew) {
      updated = [...configs, draft];
    } else {
      updated = configs.map((c) => (c.id === draft.id ? draft : c));
    }
    // If saved config is the active one, keep it active; also if first config, set it active
    const newActiveId = configs.length === 0 ? draft.id : activeId;
    onChange({ llmConfigs: updated, activeLlmConfigId: newActiveId });
    setIsNew(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [draft, isNew, configs, activeId, onChange]);

  const handleDelete = useCallback((id: string) => {
    if (configs.length <= 1) return;
    const updated = configs.filter((c) => c.id !== id);
    const newActiveId = activeId === id ? updated[0].id : activeId;
    onChange({ llmConfigs: updated, activeLlmConfigId: newActiveId });
    if (selectedId === id) {
      setSelectedId(updated[0]?.id || null);
      setDraft(updated[0] ? { ...updated[0] } : null);
    }
  }, [configs, activeId, selectedId, onChange]);

  const handleSetActive = useCallback((id: string) => {
    onChange({ activeLlmConfigId: id });
  }, [onChange]);

  const updateDraft = useCallback((k: string, v: string | number | boolean | undefined) => {
    setDraft((p) => (p ? { ...p, [k]: v } : null));
  }, []);

  const isDirty = draft
    ? JSON.stringify(draft) !== JSON.stringify(configs.find((c) => c.id === draft.id))
    : false;

  return (
    <div className="flex gap-0 h-full" style={{ minHeight: 360 }}>
      {/* Left: config list */}
      <div className="w-44 border-r border-gray-800 flex flex-col flex-shrink-0">
        <div className="px-2 py-2">
          <button
            onClick={handleAdd}
            className="w-full text-xs px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            + {t("settings.llm.addConfig")}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {configs.map((cfg) => (
            <div
              key={cfg.id}
              onClick={() => handleSelect(cfg.id)}
              className={`px-3 py-2 cursor-pointer transition-colors border-l-2 ${
                selectedId === cfg.id
                  ? "bg-gray-800 border-blue-500"
                  : "border-transparent hover:bg-gray-800/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="text-xs text-gray-200 truncate flex-1">
                  {cfg.name || t("settings.llm.addConfig")}
                </div>
                {cfg.id === activeId && (
                  <span className="text-[10px] text-green-400 ml-1 flex-shrink-0">
                    {t("settings.llm.active")}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-gray-500 mt-0.5">
                {cfg.provider === "anthropic" ? "Anthropic" : "OpenAI"} · {cfg.model}
              </div>
            </div>
          ))}
          {configs.length === 0 && (
            <div className="px-3 py-4 text-xs text-gray-500 text-center">
              {t("settings.llm.noConfigs")}
            </div>
          )}
        </div>
      </div>

      {/* Right: edit form */}
      <div className="flex-1 overflow-y-auto p-4">
        {!draft ? (
          <div className="text-xs text-gray-500 text-center py-8">
            {t("settings.llm.selectHint")}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500">{t("settings.llm.configName")}</label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => updateDraft("name", e.target.value)}
                placeholder="e.g. Claude Sonnet"
                className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t("settings.llm.provider")}</label>
              <select
                value={draft.provider}
                onChange={(e) => updateDraft("provider", e.target.value)}
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
                value={draft.apiKey}
                onChange={(e) => updateDraft("apiKey", e.target.value)}
                placeholder="sk-..."
                className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t("settings.llm.model")}</label>
              <input
                type="text"
                value={draft.model}
                onChange={(e) => updateDraft("model", e.target.value)}
                className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t("settings.llm.baseUrl")}</label>
              <input
                type="text"
                value={draft.baseUrl || ""}
                onChange={(e) => updateDraft("baseUrl", e.target.value || undefined)}
                placeholder="https://api.deepseek.com"
                className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t("settings.llm.maxTokens")}</label>
              <input
                type="number"
                value={draft.maxTokens}
                onChange={(e) => updateDraft("maxTokens", parseInt(e.target.value) || 4096)}
                className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
              />
            </div>

            {/* Supports Vision toggle */}
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-500">{t("settings.llm.supportsVision")}</label>
              <button
                onClick={() => updateDraft("supportsVision", !draft.supportsVision)}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  draft.supportsVision !== false ? "bg-blue-600" : "bg-gray-700"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    draft.supportsVision !== false ? "translate-x-[18px]" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={!draft.name || !draft.model}
                className={`px-4 py-1.5 text-xs rounded transition-colors ${
                  saved
                    ? "bg-green-700 text-white"
                    : "bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                }`}
              >
                {saved ? "✓" : t("common.save")}
              </button>
              {draft.id !== activeId && (
                <button
                  onClick={() => handleSetActive(draft.id)}
                  className="px-3 py-1.5 text-xs rounded bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
                >
                  {t("settings.llm.setActive")}
                </button>
              )}
              {configs.length > 1 && !isNew && (
                <button
                  onClick={() => handleDelete(draft.id)}
                  className="px-3 py-1.5 text-xs rounded bg-red-900/50 hover:bg-red-800 text-red-300 transition-colors ml-auto"
                  title={t("settings.llm.deleteConfig")}
                >
                  {t("common.delete")}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
