import React, { useEffect, useState } from "react";
import { ChatPanel } from "./components/ChatPanel/ChatPanel";
import { BrowserView } from "./components/BrowserView/BrowserView";
import { ControlBar } from "./components/ControlBar/ControlBar";
import { AgentThinking } from "./components/AgentThinking/AgentThinking";
import { ReviewDialog } from "./components/ReviewDialog/ReviewDialog";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { useSession } from "./hooks/useSession";
import { useStore } from "./store";

export default function App() {
  const { mode, reviewRequest, handleReviewResponse } = useSession();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const updateSettings = useStore((s) => s.updateSettings);

  // Load persisted settings from main process on startup
  useEffect(() => {
    if (window.electronAPI?.getSettings) {
      window.electronAPI.getSettings().then((settings) => {
        updateSettings(settings);
      });
    }
  }, [updateSettings]);

  return (
    <div className="flex flex-col h-screen">
      {/* Control Bar — top strip */}
      <ControlBar onOpenSettings={() => setSettingsOpen(true)} />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel — Chat + Agent Thinking */}
        <div className="w-[400px] min-w-[320px] flex flex-col border-r border-gray-800">
          {/* Agent Thinking Indicator */}
          <AgentThinking />
          {/* Chat Panel */}
          <ChatPanel />
        </div>

        {/* Right Panel — Embedded Browser */}
        <div className="flex-1 relative">
          <BrowserView />
        </div>
      </div>

      {/* Review Dialog Modal */}
      {reviewRequest && (
        <ReviewDialog
          review={reviewRequest}
          onResponse={handleReviewResponse}
        />
      )}

      {/* Settings Modal */}
      <SettingsPanel
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}
