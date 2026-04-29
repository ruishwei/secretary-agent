import React, { useState, useEffect } from "react";
import { useStore } from "../../store";

function getActiveWebview(): any {
  const activeTabId = useStore.getState().activeTabId;
  if (!activeTabId) return null;
  return document.querySelector(`webview[data-tab-id="${activeTabId}"]`);
}

export function AddressBar() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const [urlInput, setUrlInput] = useState(activeTab?.url || "");

  useEffect(() => {
    if (activeTab) {
      setUrlInput(activeTab.url || "");
    }
  }, [activeTab?.url]);

  const handleNavigate = () => {
    const url = urlInput.trim();
    if (!url || !activeTabId) return;
    window.electronAPI?.navigateTo(url, activeTabId);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleNavigate();
    }
  };

  const handleBack = () => {
    getActiveWebview()?.goBack();
  };

  const handleForward = () => {
    getActiveWebview()?.goForward();
  };

  const handleRefresh = () => {
    getActiveWebview()?.reload();
  };

  const handleHome = () => {
    if (activeTabId) {
      window.electronAPI?.navigateTo("about:blank", activeTabId);
    }
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-gray-900 border-b border-gray-700 flex-shrink-0">
      <button
        onClick={handleBack}
        className="px-1.5 py-0.5 text-gray-400 hover:text-gray-100 text-sm"
        title="Back"
      >
        &#8592;
      </button>
      <button
        onClick={handleForward}
        className="px-1.5 py-0.5 text-gray-400 hover:text-gray-100 text-sm"
        title="Forward"
      >
        &#8594;
      </button>
      <button
        onClick={handleRefresh}
        className="px-1.5 py-0.5 text-gray-400 hover:text-gray-100 text-sm"
        title="Refresh"
      >
        &#8635;
      </button>
      <button
        onClick={handleHome}
        className="px-1.5 py-0.5 text-gray-400 hover:text-gray-100 text-sm"
        title="Home"
      >
        &#8962;
      </button>

      <input
        type="text"
        value={urlInput}
        onChange={(e) => setUrlInput(e.target.value)}
        onKeyDown={handleKeyDown}
        className="flex-1 bg-gray-800 text-gray-200 text-xs px-2 py-1 rounded outline-none focus:ring-1 focus:ring-blue-500"
        placeholder="Enter URL and press Enter..."
        spellCheck={false}
      />

      {activeTab?.isLoading && (
        <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
      )}
    </div>
  );
}
