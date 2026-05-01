import React, { useState, useEffect } from "react";
import { useI18n } from "../../i18n/useI18n";
import type { AppSettings } from "../../../shared/types";

interface Props {
  settings: AppSettings;
  onChange: (partial: Partial<AppSettings>) => void;
}

export function SettingsBrowser({ settings, onChange }: Props) {
  const { t } = useI18n();
  const [local, setLocal] = useState(settings.browser);
  const [saved, setSaved] = useState(false);

  useEffect(() => { setLocal(settings.browser); }, [settings.browser]);

  const handleSave = () => {
    onChange({ browser: local });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const domainsStr = local.autoApproveDomains.join("\n");

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-gray-500">{t("settings.browser.homeUrl")}</label>
        <input
          type="text"
          value={local.homeUrl}
          onChange={(e) => setLocal({ ...local, homeUrl: e.target.value })}
          placeholder="about:blank"
          className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5"
        />
      </div>
      <div>
        <label className="text-xs text-gray-500">
          {t("settings.browser.screenshotQuality")}: {local.screenshotQuality}%
        </label>
        <input
          type="range"
          min={10}
          max={100}
          step={5}
          value={local.screenshotQuality}
          onChange={(e) => setLocal({ ...local, screenshotQuality: Number(e.target.value) })}
          className="w-full mt-0.5"
        />
        <div className="flex justify-between text-xs text-gray-600">
          <span>10% (smaller)</span>
          <span>100% (best)</span>
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500">{t("settings.browser.autoApproveDomains")}</label>
        <textarea
          value={domainsStr}
          onChange={(e) => setLocal({ ...local, autoApproveDomains: e.target.value.split("\n").filter(Boolean) })}
          placeholder={t("settings.browser.autoApproveHint")}
          rows={3}
          className="w-full bg-gray-800 text-gray-200 rounded px-2 py-1 text-sm mt-0.5 resize-none"
        />
        <span className="text-xs text-gray-600">{t("settings.browser.autoApproveHint")}</span>
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
