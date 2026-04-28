import React, { useEffect, useRef } from "react";
import { useStore } from "../../store";

export function BrowserView() {
  const browserUrl = useStore((s) => s.browserUrl);
  const isLoading = useStore((s) => s.isLoading);
  const mode = useStore((s) => s.mode);
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<HTMLElement | null>(null);

  // Create and manage the webview element imperatively
  useEffect(() => {
    if (!containerRef.current) return;

    if (!webviewRef.current) {
      const wv = document.createElement("webview");
      wv.id = "browser-webview";
      wv.style.width = "100%";
      wv.style.height = "100%";
      wv.setAttribute("allowpopups", "false");
      wv.setAttribute("partition", "persist:browser-sec");
      if (browserUrl) {
        wv.setAttribute("src", browserUrl);
      }
      containerRef.current.appendChild(wv);
      webviewRef.current = wv;
    } else if (browserUrl && webviewRef.current.getAttribute("src") !== browserUrl) {
      webviewRef.current.setAttribute("src", browserUrl);
    }
  }, [browserUrl]);

  return (
    <div className="relative w-full h-full">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute top-0 left-0 right-0 h-1 z-10">
          <div className="h-full bg-blue-500 animate-pulse" />
        </div>
      )}

      {/* Non-interactive overlay when AI is controlling */}
      {mode === "ai" && (
        <div className="absolute inset-0 z-10 bg-transparent cursor-not-allowed" />
      )}

      {/* Webview container */}
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* URL bar overlay */}
      <div className="absolute top-0 left-0 right-0 bg-gray-900/90 backdrop-blur-sm px-3 py-1.5 z-10">
        <div className="flex items-center space-x-2">
          <div className="flex space-x-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/70" />
          </div>
          <div className="flex-1 bg-gray-800/70 rounded px-2 py-0.5 text-xs text-gray-400 truncate">
            {browserUrl || "about:blank"}
          </div>
        </div>
      </div>
    </div>
  );
}
