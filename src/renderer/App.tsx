import React, { useEffect, useState } from "react";
import { RightPanel } from "./components/RightPanel/RightPanel";
import { BrowserView } from "./components/BrowserView/BrowserView";
import { TabBar } from "./components/BrowserView/TabBar";
import { AddressBar } from "./components/BrowserView/AddressBar";
import { ControlBar } from "./components/ControlBar/ControlBar";
import { ReviewDialog } from "./components/ReviewDialog/ReviewDialog";
import { useSession } from "./hooks/useSession";
import { useStore } from "./store";
import type { RightPanelTab } from "./components/RightPanel/RightPanelHeader";

export default function App() {
  const { reviewRequest, handleReviewResponse } = useSession();
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("chat");
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
      <ControlBar onOpenSettings={() => setRightPanelTab("settings")} />

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel — Multi-Tab Browser */}
        <div className="flex-1 flex flex-col">
          <TabBar />
          <AddressBar />
          <div className="flex-1 relative">
            <BrowserView />
          </div>
        </div>

        {/* Right Panel — Chat + Settings (tabbed) */}
        <div className="w-[400px] min-w-[320px] flex flex-col border-l border-gray-800">
          <RightPanel
            activeTab={rightPanelTab}
            onTabChange={setRightPanelTab}
          />
        </div>
      </div>

      {/* Review Dialog Modal */}
      {reviewRequest && (
        <ReviewDialog
          review={reviewRequest}
          onResponse={handleReviewResponse}
        />
      )}
    </div>
  );
}
