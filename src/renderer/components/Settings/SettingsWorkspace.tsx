import React, { useState, useEffect } from "react";
import { useI18n } from "../../i18n/useI18n";

interface PathInfo { key: string; label: string; path: string; }

export function SettingsWorkspace() {
  const { t } = useI18n();
  const [paths, setPaths] = useState<PathInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.electronAPI?.workspace.getPaths().then((p) => {
      setPaths([
        { key: "skillsPath", label: t("settings.workspace.skillsPath"), path: p.skillsPath },
        { key: "memoryPath", label: t("settings.workspace.memoryPath"), path: p.memoryPath },
        { key: "sessionsPath", label: t("settings.workspace.sessionsPath"), path: p.sessionsPath },
      ]);
      setLoading(false);
    });
  }, [t]);

  const handleOpenFolder = (folderPath: string) => {
    window.electronAPI?.workspace.openFolder(folderPath);
  };

  if (loading) {
    return <div className="text-xs text-gray-400">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-2">
      {paths.map((item) => (
        <div key={item.key} className="flex items-center justify-between bg-gray-800 rounded px-2 py-1.5">
          <div className="flex-1 min-w-0">
            <span className="text-xs text-gray-400">{item.label}</span>
            <div className="text-xs text-gray-500 font-mono truncate mt-0.5">{item.path}</div>
          </div>
          <button
            onClick={() => handleOpenFolder(item.path)}
            className="ml-2 px-2 py-0.5 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded flex-shrink-0"
          >
            {t("settings.workspace.openFolder")}
          </button>
        </div>
      ))}
    </div>
  );
}
