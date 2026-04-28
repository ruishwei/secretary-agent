import React from "react";
import { ChatPanel } from "./components/ChatPanel/ChatPanel";
import { BrowserView } from "./components/BrowserView/BrowserView";
import { ControlBar } from "./components/ControlBar/ControlBar";
import { AgentThinking } from "./components/AgentThinking/AgentThinking";
import { ReviewDialog } from "./components/ReviewDialog/ReviewDialog";
import { useSession } from "./hooks/useSession";

export default function App() {
  const { mode, reviewRequest, handleReviewResponse } = useSession();

  return (
    <div className="flex flex-col h-screen">
      {/* Control Bar — top strip */}
      <ControlBar />

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
    </div>
  );
}
