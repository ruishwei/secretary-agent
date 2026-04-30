import React from "react";
import { useStore } from "../../store";

export function TabBar() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    if (tabs.length <= 1) return;
    if (window.electronAPI?.closeTab) {
      window.electronAPI.closeTab(tabId);
    }
  };

  const handleNewTab = () => {
    if (window.electronAPI?.createTab) {
      window.electronAPI.createTab();
    }
  };

  return (
    <div className="flex items-center bg-gray-900 border-b border-gray-700 overflow-x-auto select-none flex-shrink-0">
      <div className="flex flex-1 min-w-0">
        {/* Browser tabs */}
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                window.electronAPI?.switchTab(tab.id);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 cursor-pointer border-r border-gray-700 min-w-[120px] max-w-[240px] flex-shrink-0 group ${
                isActive
                  ? "bg-gray-800 border-t-2 border-t-blue-500 text-gray-100"
                  : "bg-gray-900 text-gray-400 hover:bg-gray-800"
              }`}
              title={tab.url || "about:blank"}
            >
              {tab.isLoading ? (
                <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              ) : tab.favicon ? (
                <>
                  <img src={tab.favicon} className="w-4 h-4 flex-shrink-0" alt=""
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden");
                    }}
                  />
                  <svg className="hidden w-4 h-4 flex-shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <ellipse cx="12" cy="12" rx="4" ry="10" />
                    <path d="M2 12h20" />
                  </svg>
                </>
              ) : (
                <svg className="w-4 h-4 flex-shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10" />
                  <ellipse cx="12" cy="12" rx="4" ry="10" />
                  <path d="M2 12h20" />
                </svg>
              )}
              <span className="text-xs truncate flex-1">
                {tab.title || tab.url || "New Tab"}
              </span>
              {tabs.length > 1 && (
                <button
                  onClick={(e) => handleClose(e, tab.id)}
                  className="flex-shrink-0 w-4 h-4 flex items-center justify-center rounded-full hover:bg-gray-600 text-gray-500 hover:text-gray-100 text-xs leading-none ml-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  &#x2715;
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
