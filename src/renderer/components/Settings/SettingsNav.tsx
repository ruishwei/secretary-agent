import React from "react";
import { useI18n } from "../../i18n/useI18n";

const SECTIONS = [
  "llm", "voice", "browser", "privacy", "language", "memory", "skills", "workspace",
] as const;

export type SettingsSection = (typeof SECTIONS)[number];

interface Props {
  activeSection: SettingsSection;
  onSelect: (section: SettingsSection) => void;
}

export function SettingsNav({ activeSection, onSelect }: Props) {
  const { t } = useI18n();

  return (
    <nav className="flex flex-col py-2">
      {SECTIONS.map((section) => (
        <button
          key={section}
          onClick={() => onSelect(section)}
          className={`text-xs text-left px-3 py-1.5 transition-colors ${
            activeSection === section
              ? "bg-gray-800 text-gray-100 border-l-2 border-blue-500"
              : "text-gray-400 hover:bg-gray-800/50 hover:text-gray-200 border-l-2 border-transparent"
          }`}
        >
          {t(`settings.nav.${section}`)}
        </button>
      ))}
    </nav>
  );
}
