import React, { useEffect, useRef } from "react";
import { useStore } from "../../store";
import type { Tab } from "../../../shared/types";

export function BrowserView() {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const isLoading = useStore((s) => s.tabs.some((t) => t.isLoading));
  const mode = useStore((s) => s.mode);
  const addTab = useStore((s) => s.addTab);
  const updateTab = useStore((s) => s.updateTab);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const cdpAttachedRef = useRef<Set<string>>(new Set());

  // One-time initialization of the default tab
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    if (tabs.length === 0) {
      const initialTab: Tab = {
        id: "tab-initial",
        url: "about:blank",
        title: "",
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        webContentsId: null,
      };
      addTab(initialTab);
    }
  }, []);

  // Listen for browser state changes (from main process navigation)
  useEffect(() => {
    if (!window.electronAPI?.onBrowserStateChanged) return;
    const unsubscribe = window.electronAPI.onBrowserStateChanged((state) => {
      updateTab(state.tabId, {
        url: state.url,
        title: state.title,
        isLoading: state.isLoading,
        canGoBack: state.canGoBack,
        canGoForward: state.canGoForward,
      });
    });
    return unsubscribe;
  }, [updateTab]);

  // Listen for tab-state-changed from main process
  useEffect(() => {
    if (!window.electronAPI?.onTabStateChanged) return;
    const unsubscribe = window.electronAPI.onTabStateChanged((state) => {
      updateTab(state.tabId, {
        url: state.url,
        title: state.title,
        isLoading: state.isLoading,
        canGoBack: state.canGoBack,
        canGoForward: state.canGoForward,
      });
    });
    return unsubscribe;
  }, [updateTab]);

  // Listen for popup interception from main process (setWindowOpenHandler)
  useEffect(() => {
    if (!window.electronAPI?.onPopupOpen) return;
    const unsubscribe = window.electronAPI.onPopupOpen((data) => {
      addTab({
        id: data.tabId,
        url: data.url,
        title: "",
        isLoading: true,
        canGoBack: false,
        canGoForward: false,
        webContentsId: null,
      });
    });
    return unsubscribe;
  }, [addTab]);

  // Create/destroy webview elements for each tab
  useEffect(() => {
    if (!containerRef.current || tabs.length === 0) return;
    const container = containerRef.current;

    tabs.forEach((tab) => {
      const existingWv = container.querySelector(`[data-tab-id="${tab.id}"]`) as HTMLElement | null;
      if (existingWv) {
        existingWv.style.display = tab.id === activeTabId ? "flex" : "none";
        return;
      }

      const wv = document.createElement("webview") as any;
      wv.dataset.tabId = tab.id;
      wv.style.width = "100%";
      wv.style.height = "100%";
      wv.style.display = tab.id === activeTabId ? "flex" : "none";
      wv.setAttribute("partition", "persist:browser-sec");
      // Must explicitly set allowpopups=true — the default is false,
      // which blocks window.open at the JS engine level and prevents
      // the new-window event from firing.
      wv.setAttribute("allowpopups", "true");

      // Intercept popups / target=_blank: catch the new-window event,
      // prevent a native OS window, and create a new tab instead.
      wv.addEventListener("new-window", (e: any) => {
        e.preventDefault();
        const url = e.url;
        if (url && url !== "about:blank") {
          addTab({
            id: `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            url,
            title: "",
            isLoading: true,
            canGoBack: false,
            canGoForward: false,
            webContentsId: null,
          });
        }
      });

      // Attach CDP on dom-ready
      wv.addEventListener("dom-ready", () => {
        if (!cdpAttachedRef.current.has(tab.id)) {
          cdpAttachedRef.current.add(tab.id);
          const wcId = wv.getWebContentsId?.();
          if (wcId && window.electronAPI?.attachWebview) {
            window.electronAPI.attachWebview(tab.id, wcId);
          }
        }
      });

      // Track favicon
      wv.addEventListener("page-favicon-updated", (e: any) => {
        if (e.favicons && e.favicons.length > 0) {
          updateTab(tab.id, { favicon: e.favicons[0] });
        }
      });

      // Track title
      wv.addEventListener("page-title-updated", (e: any) => {
        updateTab(tab.id, { title: e.title });
      });

      // After navigation, refresh canGoBack / canGoForward from the webview
      const refreshNavState = () => {
        try {
          updateTab(tab.id, {
            canGoBack: wv.canGoBack?.(),
            canGoForward: wv.canGoForward?.(),
            isLoading: false,
          });
        } catch { /* webview methods may not be available yet */ }
      };

      wv.addEventListener("did-navigate", (e: any) => {
        updateTab(tab.id, { url: e.url });
        refreshNavState();
      });
      wv.addEventListener("did-navigate-in-page", (e: any) => {
        if (e.url) updateTab(tab.id, { url: e.url });
      });
      wv.addEventListener("did-start-loading", () => {
        updateTab(tab.id, { isLoading: true });
      });
      wv.addEventListener("did-stop-loading", () => {
        updateTab(tab.id, { isLoading: false });
        refreshNavState();
      });

      // Append to DOM first, then set src so all listeners are in place
      container.appendChild(wv);
      wv.setAttribute("src", tab.url || "about:blank");
    });

    // Remove webviews for tabs that no longer exist in store
    const tabIds = new Set(tabs.map((t) => t.id));
    const allWvs = container.querySelectorAll("webview");
    allWvs.forEach((wv) => {
      const wvTabId = (wv as HTMLElement).dataset.tabId;
      if (wvTabId && !tabIds.has(wvTabId)) {
        cdpAttachedRef.current.delete(wvTabId);
        wv.remove();
      }
    });
  }, [tabs, activeTabId, addTab, updateTab]);

  // Toggle visibility when active tab changes (no creation needed)
  useEffect(() => {
    if (!containerRef.current || !activeTabId) return;
    const allWvs = containerRef.current.querySelectorAll("webview");
    allWvs.forEach((wv) => {
      const el = wv as HTMLElement;
      el.style.display = el.dataset.tabId === activeTabId ? "flex" : "none";
    });
  }, [activeTabId]);

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute top-0 left-0 right-0 h-1 z-20">
          <div className="h-full bg-blue-500 animate-pulse" />
        </div>
      )}

      {mode === "ai" && (
        <div className="absolute inset-0 z-10 bg-transparent cursor-not-allowed" />
      )}

      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
