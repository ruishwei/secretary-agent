import React, { useState, useEffect } from "react";
import { useStore } from "../../store";
import { SkillReviewDialog } from "./SkillReviewDialog";

export function AddressBar() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const recordingState = useStore((s) => s.recordingState);
  const setRecordingState = useStore((s) => s.setRecordingState);
  const pendingSkillReview = useStore((s) => s.pendingSkillReview);
  const setPendingSkillReview = useStore((s) => s.setPendingSkillReview);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const [urlInput, setUrlInput] = useState(activeTab?.url || "");

  useEffect(() => {
    if (activeTab) {
      setUrlInput(activeTab.url || "");
    }
  }, [activeTab?.url]);

  // Listen for recording state changes from main process
  useEffect(() => {
    const unsub = window.electronAPI?.onRecordingStateChanged((state) => {
      setRecordingState(state);
    });
    return () => unsub?.();
  }, [setRecordingState]);

  const handleNavigate = () => {
    const url = urlInput.trim();
    if (!url) return;
    if (!activeTabId) return;
    window.electronAPI?.navigateTo(url, activeTabId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleNavigate();
    }
  };

  const handleBack = () => {
    window.electronAPI?.goBack(activeTabId ?? undefined);
  };

  const handleForward = () => {
    window.electronAPI?.goForward(activeTabId ?? undefined);
  };

  const handleRefresh = () => {
    window.electronAPI?.refresh(activeTabId ?? undefined);
  };

  const handleHome = () => {
    if (activeTabId) {
      window.electronAPI?.navigateTo("about:blank", activeTabId);
    }
  };

  const handleToggleRecord = async () => {
    if (recordingState.isRecording) {
      const result = await window.electronAPI?.stopRecording();
      if (result?.success && result.skillContent) {
        setPendingSkillReview({
          skillName: result.skillName || "untitled-skill",
          content: result.skillContent,
          actionCount: result.actionCount,
        });
      }
    } else {
      window.electronAPI?.startRecording();
    }
  };

  const handleSaveSkill = async (content: string) => {
    await window.electronAPI?.saveSkill();
    setPendingSkillReview(null);
  };

  const handleDiscardSkill = async () => {
    await window.electronAPI?.discardSkill();
    setPendingSkillReview(null);
  };

  const isLoading = activeTab?.isLoading;
  const canGoBack = activeTab?.canGoBack ?? false;
  const canGoForward = activeTab?.canGoForward ?? false;
  const isRecording = recordingState.isRecording;

  const btnBase = "px-1.5 py-0.5 text-sm rounded transition-colors";
  const btnActive = "text-gray-400 hover:text-gray-100 hover:bg-gray-800";
  const btnDisabled = "text-gray-700 cursor-default";

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-gray-900 border-b border-gray-700 flex-shrink-0">
      <button
        onClick={handleBack}
        disabled={!canGoBack}
        className={`${btnBase} ${canGoBack ? btnActive : btnDisabled}`}
        title="Back"
      >
        &#8592;
      </button>
      <button
        onClick={handleForward}
        disabled={!canGoForward}
        className={`${btnBase} ${canGoForward ? btnActive : btnDisabled}`}
        title="Forward"
      >
        &#8594;
      </button>
      <button
        onClick={handleRefresh}
        className={`${btnBase} ${isLoading ? "text-red-400 hover:text-red-300 hover:bg-gray-800" : btnActive}`}
        title={isLoading ? "Stop" : "Refresh"}
      >
        {isLoading ? "✕" : "⟳"}
      </button>
      <button
        onClick={handleHome}
        className={`${btnBase} ${btnActive}`}
        title="Home"
      >
        &#8962;
      </button>

      <input
        type="text"
        value={urlInput}
        onChange={(e) => setUrlInput(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 bg-gray-800 text-xs px-2 py-1 rounded outline-none focus:ring-1 focus:ring-blue-500 text-gray-200"
        placeholder="Enter URL and press Enter..."
        spellCheck={false}
      />

      {/* Record button */}
      <button
        onClick={handleToggleRecord}
        className={`flex items-center gap-1 px-2 py-0.5 text-xs rounded transition-colors flex-shrink-0 ${
          isRecording
            ? "bg-red-900/60 text-red-300 border border-red-600 hover:bg-red-900"
            : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
        }`}
        title={isRecording ? "Stop recording" : "Record browser actions"}
      >
        <span className={`w-2 h-2 rounded-full ${isRecording ? "bg-red-500 animate-pulse" : "bg-gray-500"}`} />
        {isRecording ? `Recording (${recordingState.actionCount})` : "Record"}
      </button>

      {isLoading && (
        <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
      )}

      {/* Skill Review Dialog */}
      {pendingSkillReview && (
        <SkillReviewDialog
          skillName={pendingSkillReview.skillName}
          content={pendingSkillReview.content}
          actionCount={pendingSkillReview.actionCount}
          onSave={handleSaveSkill}
          onDiscard={handleDiscardSkill}
        />
      )}
    </div>
  );
}
