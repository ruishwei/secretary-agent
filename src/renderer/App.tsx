import React, { useEffect, useState } from "react";
import { ChatPanel } from "./components/ChatPanel/ChatPanel";
import { BrowserView } from "./components/BrowserView/BrowserView";
import { TabBar } from "./components/BrowserView/TabBar";
import { AddressBar } from "./components/BrowserView/AddressBar";
import { AgentThinking } from "./components/AgentThinking/AgentThinking";
import { ReviewDialog } from "./components/ReviewDialog/ReviewDialog";
import { SettingsLayout } from "./components/Settings/SettingsLayout";
import { useSession } from "./hooks/useSession";
import { useStore } from "./store";

export default function App() {
  const { reviewRequest, handleReviewResponse } = useSession();
  const updateSettings = useStore((s) => s.updateSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Load persisted settings from main process on startup
  useEffect(() => {
    if (window.electronAPI?.getSettings) {
      window.electronAPI.getSettings().then((settings) => {
        updateSettings(settings);
      });
    }
  }, [updateSettings]);

  // Hide native WebContentsView when settings modal is open (native views overlay CSS)
  useEffect(() => {
    window.electronAPI?.setBrowserVisible(!settingsOpen);
  }, [settingsOpen]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left Panel — Chat */}
      <div className="w-[400px] min-w-[320px] flex flex-col border-r border-gray-800">
        <AgentThinking />
        <ChatPanel onSettingsClick={() => setSettingsOpen(true)} />
      </div>

      {/* Right Panel — Browser */}
      <div className="flex-1 flex flex-col">
        <TabBar />
        <AddressBar />
        <div className="flex-1 relative">
          <BrowserView />
        </div>
      </div>

      {/* Review Dialog Modal */}
      {reviewRequest && (
        <ReviewDialog review={reviewRequest} onResponse={handleReviewResponse} />
      )}

      {/* Settings Modal */}
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-gray-950 flex">
          <SettingsLayout />
          <button
            onClick={() => setSettingsOpen(false)}
            className="absolute top-3 right-3 text-gray-400 hover:text-gray-200 text-lg leading-none z-10"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
