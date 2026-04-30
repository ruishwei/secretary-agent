import React from "react";
import { useI18n } from "../../i18n/useI18n";

export type RightPanelTab = "chat" | "settings";

interface Props {
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
}

export function RightPanelHeader({ activeTab, onTabChange }: Props) {
  const { t } = useI18n();

  const tabBase = "flex-1 text-xs py-1.5 text-center transition-colors border-b-2";
  const tabActive = "text-gray-100 border-blue-500";
  const tabInactive = "text-gray-500 hover:text-gray-300 border-transparent";

  return (
    <div className="flex border-b border-gray-800 flex-shrink-0">
      <button
        onClick={() => onTabChange("chat")}
        className={`${tabBase} ${activeTab === "chat" ? tabActive : tabInactive}`}
      >
        {t("tabs.chat")}
      </button>
      <button
        onClick={() => onTabChange("settings")}
        className={`${tabBase} ${activeTab === "settings" ? tabActive : tabInactive}`}
      >
        {t("tabs.settings")}
      </button>
    </div>
  );
}
