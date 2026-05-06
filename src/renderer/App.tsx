import React, { useEffect, useState } from "react";
import { ChatTabs } from "./components/ChatPanel/ChatTabs";
import { BrowserView } from "./components/BrowserView/BrowserView";
import { TabBar } from "./components/BrowserView/TabBar";
import { AddressBar } from "./components/BrowserView/AddressBar";
import { AgentThinking } from "./components/AgentThinking/AgentThinking";
import { ReviewDialog } from "./components/ReviewDialog/ReviewDialog";
import { SettingsLayout } from "./components/Settings/SettingsLayout";
import { FloatingMode } from "./components/FloatingMode/FloatingMode";
import { useSession } from "./hooks/useSession";
import { useStore } from "./store";

export default function App() {
  const { reviewRequest, handleReviewResponse } = useSession();
  const updateSettings = useStore((s) => s.updateSettings);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [floating, setFloating] = useState(false);

  useEffect(() => {
    if (!window.electronAPI?.onFloatingStateChanged) return;
    const unsub = window.electronAPI.onFloatingStateChanged((f) => setFloating(f));
    return unsub;
  }, []);

  // Load persisted settings from main process on startup
  useEffect(() => {
    if (window.electronAPI?.getSettings) {
      window.electronAPI.getSettings().then((settings) => {
        updateSettings(settings);
      });
    }
  }, [updateSettings]);

  // Hide native WebContentsView when settings or review dialog is open (native views overlay DOM)
  useEffect(() => {
    window.electronAPI?.setBrowserVisible(!settingsOpen && !reviewRequest);
  }, [settingsOpen, reviewRequest]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Floating Mode */}
      <FloatingMode />

      {/* Full layout (hidden in floating mode) */}
      {!floating && (
        <>
      {/* Left Panel — Chat */}
      <div className="w-[400px] min-w-[320px] flex flex-col border-r border-gray-800">
        <AgentThinking />
        <div className="flex items-center justify-between px-3 py-1 border-b border-gray-800 bg-gray-900/40">
          <span className="text-xs text-gray-500 font-medium tracking-wide uppercase">Chat</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => window.electronAPI?.toggleFloating()}
              title="Floating Mode"
              className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                floating
                  ? "bg-cyan-700/40 border-cyan-600 text-cyan-300"
                  : "border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500"
              }`}
            >
              🪟
            </button>
            <button
              onClick={() => setSettingsOpen(true)}
              className="px-2 py-0.5 text-xs rounded border border-gray-700 text-gray-500 hover:text-gray-300 hover:border-gray-500 transition-colors"
              title="Settings"
            >
              ⚙
            </button>
          </div>
        </div>
        <ChatTabs onSettingsClick={() => setSettingsOpen(true)} />
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

        </>
      )}
    </div>
  );
}
