import React, { useState } from "react";
import { ChatPanel } from "./ChatPanel";
import { TaskList } from "./TaskList";

type TabId = "chat" | "tasks";

interface Props {
  onSettingsClick: () => void;
}

export function ChatTabs({ onSettingsClick }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>("chat");

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
      {/* Tab bar */}
      <div
        style={{
          display: "flex",
          borderBottom: "1px solid #2a2a2a",
          background: "#141414",
          flexShrink: 0,
        }}
      >
        <TabButton
          active={activeTab === "chat"}
          onClick={() => setActiveTab("chat")}
          label="Chat"
          icon="💬"
        />
        <TabButton
          active={activeTab === "tasks"}
          onClick={() => setActiveTab("tasks")}
          label="Tasks"
          icon="📋"
        />
      </div>

      {/* All panels stay mounted; hidden via display:none to preserve event listeners */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <div style={{ display: activeTab === "chat" ? "flex" : "none", height: "100%" }}>
          <ChatPanel onSettingsClick={onSettingsClick} />
        </div>
        <div style={{ display: activeTab === "tasks" ? "block" : "none", height: "100%" }}>
          <TaskList />
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 14px",
        border: "none",
        borderBottom: active ? "2px solid #4ec9b0" : "2px solid transparent",
        background: active ? "#1a1a1a" : "transparent",
        color: active ? "#e0e0e0" : "#666",
        cursor: "pointer",
        fontSize: 11,
        fontFamily: "inherit",
        display: "flex",
        alignItems: "center",
        gap: 5,
        transition: "color 0.15s, border-color 0.15s",
      }}
    >
      <span style={{ fontSize: 13 }}>{icon}</span>
      <span>{label}</span>
    </button>
  );
}
