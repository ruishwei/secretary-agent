import React, { useState } from "react";
import { useStore } from "../../store";
import { SettingsNav, type SettingsSection } from "./SettingsNav";
import { SettingsLLM } from "./SettingsLLM";
import { SettingsVoice } from "./SettingsVoice";
import { SettingsBrowser } from "./SettingsBrowser";
import { SettingsPrivacy } from "./SettingsPrivacy";
import { SettingsLanguage } from "./SettingsLanguage";
import { SettingsMemory } from "./SettingsMemory";
import { SettingsSkills } from "./SettingsSkills";
import { SettingsWorkspace } from "./SettingsWorkspace";
import { SettingsShortcuts } from "./SettingsShortcuts";
import type { AppSettings } from "../../../shared/types";

export function SettingsLayout() {
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const [activeSection, setActiveSection] = useState<SettingsSection>("llm");

  const handleChange = (partial: Partial<AppSettings>) => {
    updateSettings(partial);
    window.electronAPI?.updateSettings(partial);
  };

  const renderSection = () => {
    switch (activeSection) {
      case "llm":
        return <SettingsLLM settings={settings} onChange={handleChange} />;
      case "voice":
        return <SettingsVoice settings={settings} onChange={handleChange} />;
      case "browser":
        return <SettingsBrowser settings={settings} onChange={handleChange} />;
      case "privacy":
        return <SettingsPrivacy />;
      case "language":
        return <SettingsLanguage />;
      case "shortcuts":
        return <SettingsShortcuts />;
      case "memory":
        return <SettingsMemory />;
      case "skills":
        return <SettingsSkills />;
      case "workspace":
        return <SettingsWorkspace />;
    }
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="w-36 border-r border-gray-800 flex-shrink-0 overflow-y-auto">
        <SettingsNav activeSection={activeSection} onSelect={setActiveSection} />
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {renderSection()}
      </div>
    </div>
  );
}
