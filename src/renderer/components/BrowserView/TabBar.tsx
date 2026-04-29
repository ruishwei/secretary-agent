import React from "react";
import { useStore } from "../../store";
import type { Tab } from "../../../shared/types";

export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const addTab = useStore((s) => s.addTab);
  const removeTab = useStore((s) => s.removeTab);

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;
    removeTab(tabId);
    // Notify main process to clean up the TabSession
    if (window.electronAPI?.closeTab) {
      window.electronAPI.closeTab(tabId);
    }
  };

  const handleNewTab = () => {
    const newTab: Tab = {
      id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url: "about:blank",
      title: "",
      isLoading: false,
      canGoBack: false,
      canGoForward: false,
      webContentsId: null,
    };
    addTab(newTab);
  };

  return (
    <div className="flex items-center bg-gray-900 border-b border-gray-700 overflow-x-auto select-none flex-shrink-0">
      <div className="flex flex-1 min-w-0">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 cursor-pointer border-r border-gray-700 min-w-[120px] max-w-[240px] flex-shrink-0 ${
                isActive
                  ? "bg-gray-800 border-t-2 border-t-blue-500 text-gray-100"
                  : "bg-gray-900 text-gray-400 hover:bg-gray-800"
              }`}
              title={tab.url || "about:blank"}
            >
              {tab.favicon ? (
                <img src={tab.favicon} className="w-4 h-4 flex-shrink-0" alt="" />
              ) : (
                <div className="w-4 h-4 flex-shrink-0 rounded bg-gray-600" />
              )}
              <span className="text-xs truncate flex-1">
                {tab.title || tab.url || "New Tab"}
              </span>
              {tab.isLoading && (
                <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => handleClose(e, tab.id)}
                  className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-gray-600 text-gray-500 hover:text-gray-200 text-xs leading-none ml-0.5"
                >
                  x
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button
        onClick={handleNewTab}
        className="flex-shrink-0 px-3 py-1.5 text-gray-400 hover:text-gray-100 hover:bg-gray-800 text-lg leading-none"
        title="New Tab"
      >
        +
      </button>
    </div>
  );
}
