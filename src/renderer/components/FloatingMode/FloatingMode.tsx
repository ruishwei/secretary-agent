import React, { useEffect, useState, useCallback } from "react";
import { useSendMessage } from "../../hooks/useSendMessage";

export function FloatingMode() {
  const [floating, setFloating] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const { send, isStreaming } = useSendMessage();

  useEffect(() => {
    if (!window.electronAPI?.onFloatingStateChanged) return;
    const unsub = window.electronAPI.onFloatingStateChanged((f) => setFloating(f));
    return unsub;
  }, []);

  const handleSend = useCallback(async () => {
    const text = inputValue.trim();
    if (!text) return;
    setInputValue("");
    await send(text);
  }, [inputValue, send]);

  if (!floating) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(12, 12, 16, 0.97)",
        borderRadius: 10,
        border: "1px solid rgba(255, 140, 0, 0.15)",
        boxShadow: "0 0 30px rgba(255, 100, 0, 0.08), 0 4px 20px rgba(0,0,0,0.5)",
        overflow: "hidden",
        userSelect: "none",
      } as React.CSSProperties}
    >
      {/* Corona glow accent line at top */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "20%",
          right: "20%",
          height: 1,
          background: "linear-gradient(90deg, transparent, rgba(255,140,0,0.5), rgba(255,200,100,0.3), rgba(255,140,0,0.5), transparent)",
        }}
      />

      {/* Content row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "6px 10px",
          gap: 8,
          width: "100%",
          height: "100%",
        }}
      >
        {/* Corona icon — status indicator */}
        <div
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: isStreaming
              ? "radial-gradient(circle, #FFB833, #E07000)"
              : "radial-gradient(circle, #444, #222)",
            boxShadow: isStreaming ? "0 0 10px rgba(255,140,0,0.5)" : undefined,
            flexShrink: 0,
            transition: "all 0.3s",
          }}
          title="Corona"
        />

        {/* Text input */}
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder={isStreaming ? "Queue another task..." : "Ask Corona..."}
          autoFocus
          style={{
            flex: 1,
            background: "transparent",
            border: "none",
            outline: "none",
            color: "#d0d0d0",
            fontSize: 13,
            fontFamily: "'Cascadia Code', 'Fira Code', system-ui, sans-serif",
          }}
        />

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!inputValue.trim()}
          title="Send"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "none",
            background: inputValue.trim()
              ? "linear-gradient(135deg, #FF8C00, #E07000)"
              : "#2a2a2a",
            color: inputValue.trim() ? "#fff" : "#555",
            cursor: inputValue.trim() ? "pointer" : "default",
            fontSize: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s",
          }}
        >
          →
        </button>

        {/* Exit floating */}
        <button
          onClick={() => window.electronAPI?.toggleFloating()}
          title="Exit floating mode"
          style={{
            width: 24,
            height: 24,
            borderRadius: "50%",
            border: "1px solid #333",
            background: "transparent",
            color: "#666",
            cursor: "pointer",
            fontSize: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) => { (e.target as HTMLButtonElement).style.color = "#aaa"; }}
          onMouseLeave={(e) => { (e.target as HTMLButtonElement).style.color = "#666"; }}
        >
          ×
        </button>
      </div>
    </div>
  );
}
