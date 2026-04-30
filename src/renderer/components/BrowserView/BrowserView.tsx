import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";

type LoadState = "idle" | "loading" | "finishing";

export function BrowserView() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const isLoading = useStore((s) => s.tabs.some((t) => t.isLoading));
  const isStreaming = useStore((s) => s.isStreaming);
  const updateTab = useStore((s) => s.updateTab);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const [loadState, setLoadState] = useState<LoadState>("idle");

  // One-time initialization — request browser infrastructure + default tab.
  // The main process creates the WebContentsView and pushes tab state via
  // onTabListChanged / onTabStateChanged IPC events.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (window.electronAPI?.createTab) {
      window.electronAPI.createTab();
    }
  }, []);

  // Measure container bounds and push to main process for WebContentsView positioning
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const measureAndPush = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && window.electronAPI?.updateBrowserLayout) {
        window.electronAPI.updateBrowserLayout({
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    };

    // Initial measurement (after layout)
    const initialTimer = setTimeout(measureAndPush, 100);

    // Re-measure on resize
    const observer = new ResizeObserver(() => {
      measureAndPush();
    });
    observer.observe(el);

    return () => {
      clearTimeout(initialTimer);
      observer.disconnect();
    };
  }, []);

  // Listen for tab list changes from main process
  useEffect(() => {
    if (!window.electronAPI?.onTabListChanged) return;
    const unsubscribe = window.electronAPI.onTabListChanged((data) => {
      const { tabs: tabList, activeTabId: activeId } = data;
      const currentTabs = useStore.getState().tabs;

      // Build new tab list: preserve existing tabs, add new ones
      const currentIds = new Set(currentTabs.map((t) => t.id));
      const syncedTabs = tabList.map((t) => {
        const existing = currentTabs.find((st) => st.id === t.tabId);
        if (existing) return existing;
        return {
          id: t.tabId,
          url: t.url,
          title: t.title,
          favicon: t.favicon,
          isLoading: false,
          canGoBack: false,
          canGoForward: false,
          webContentsId: null,
        };
      });

      // Batch update store without flipping activeTabId per addTab
      useStore.setState({ tabs: syncedTabs, activeTabId: activeId || useStore.getState().activeTabId });

      // Sync active tab to main process
      if (activeId) {
        window.electronAPI?.switchTab(activeId);
      }
    });
    return unsubscribe;
  }, []);

  // Listen for tab state changes from main process
  useEffect(() => {
    if (!window.electronAPI?.onTabStateChanged) return;
    const unsubscribe = window.electronAPI.onTabStateChanged((state) => {
      updateTab(state.tabId, {
        url: state.url,
        title: state.title,
        favicon: state.favicon,
        isLoading: state.isLoading,
        canGoBack: state.canGoBack,
        canGoForward: state.canGoForward,
      });
    });
    return unsubscribe;
  }, [updateTab]);

  // Listen for browser state changes (from agent-initiated navigation)
  useEffect(() => {
    if (!window.electronAPI?.onBrowserStateChanged) return;
    const unsubscribe = window.electronAPI.onBrowserStateChanged((state) => {
      updateTab(state.tabId, {
        url: state.url,
        title: state.title,
        favicon: state.favicon,
        isLoading: state.isLoading,
        canGoBack: state.canGoBack,
        canGoForward: state.canGoForward,
      });
    });
    return unsubscribe;
  }, [updateTab]);

  // Listen for popup interception from main process.
  // Tab creation is handled by the onTabListChanged sync handler;
  // this event exists for any additional UI feedback (toast, etc.).
  useEffect(() => {
    if (!window.electronAPI?.onPopupOpen) return;
    const unsubscribe = window.electronAPI.onPopupOpen((_data) => {
      // Tab is already created via TAB_LIST_CHANGED sent by popup callback
    });
    return unsubscribe;
  }, []);

  // Drive loading progress bar state machine
  useEffect(() => {
    if (isLoading && loadState === "idle") {
      setLoadState("loading");
    } else if (!isLoading && loadState === "loading") {
      setLoadState("finishing");
      const timer = setTimeout(() => setLoadState("idle"), 500);
      return () => clearTimeout(timer);
    }
  }, [isLoading, loadState]);

  return (
    <div ref={containerRef} className="relative w-full h-full">
      {/* Simulated browser loading progress bar */}
      {loadState !== "idle" && (
        <div className="absolute top-0 left-0 right-0 h-0.5 z-20 bg-gray-900/40">
          <div
            className={`h-full bg-blue-500 ${
              loadState === "finishing" ? "loading-bar-finish" : "loading-bar-start"
            }`}
          />
        </div>
      )}

      {/* Transparent overlay to block user interaction while agent is working */}
      {isStreaming && (
        <div className="absolute inset-0 z-10 bg-transparent cursor-not-allowed" />
      )}

      {/* WebContentsView is rendered by main process in this area.
           The container ref above is used to measure bounds. */}
    </div>
  );
}
