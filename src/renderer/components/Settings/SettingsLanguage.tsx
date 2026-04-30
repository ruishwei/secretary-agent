import React from "react";
import { useStore } from "../../store";
import { useI18n } from "../../i18n/useI18n";

export function SettingsLanguage() {
  const { t, language } = useI18n();
  const updateSettings = useStore((s) => s.updateSettings);

  const handleChange = (lang: "zh-CN" | "en") => {
    updateSettings({ language: lang });
    window.electronAPI?.updateSettings({ language: lang });
  };

  const radioBase = "border border-gray-700 rounded p-3 cursor-pointer transition-colors flex items-center gap-3";
  const radioActive = "border-blue-500 bg-blue-900/20";
  const radioInactive = "hover:bg-gray-800/50";

  return (
    <div className="space-y-2">
      <div
        onClick={() => handleChange("zh-CN")}
        className={`${radioBase} ${language === "zh-CN" ? radioActive : radioInactive}`}
      >
        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          language === "zh-CN" ? "border-blue-500" : "border-gray-600"
        }`}>
          {language === "zh-CN" && <div className="w-2 h-2 rounded-full bg-blue-500" />}
        </div>
        <span className="text-sm text-gray-200">{t("settings.language.zhCN")}</span>
      </div>
      <div
        onClick={() => handleChange("en")}
        className={`${radioBase} ${language === "en" ? radioActive : radioInactive}`}
      >
        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          language === "en" ? "border-blue-500" : "border-gray-600"
        }`}>
          {language === "en" && <div className="w-2 h-2 rounded-full bg-blue-500" />}
        </div>
        <span className="text-sm text-gray-200">{t("settings.language.en")}</span>
      </div>
    </div>
  );
}
