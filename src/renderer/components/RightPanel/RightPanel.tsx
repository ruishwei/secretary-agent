import React from "react";
import { ChatPanel } from "../ChatPanel/ChatPanel";
import { AgentThinking } from "../AgentThinking/AgentThinking";
import { SettingsLayout } from "../Settings/SettingsLayout";
import { RightPanelHeader, type RightPanelTab } from "./RightPanelHeader";

interface Props {
  activeTab: RightPanelTab;
  onTabChange: (tab: RightPanelTab) => void;
}

export function RightPanel({ activeTab, onTabChange }: Props) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <RightPanelHeader activeTab={activeTab} onTabChange={onTabChange} />

      {/* Chat tab — hidden (not unmounted) when Settings is active to preserve streaming state */}
      <div className={`flex flex-col flex-1 overflow-hidden ${activeTab !== "chat" ? "hidden" : ""}`}>
        <AgentThinking />
        <ChatPanel />
      </div>

      {/* Settings tab — hidden (not unmounted) when Chat is active to preserve nav + edit state */}
      <div className={`flex-1 overflow-hidden ${activeTab !== "settings" ? "hidden" : ""}`}>
        <SettingsLayout />
      </div>
    </div>
  );
}
