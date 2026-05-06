import { useEffect, useState, useCallback } from "react";
import type { Task, TaskSnapshot } from "../../../shared/types";

const statusColors: Record<string, string> = {
  pending: "#888",
  active: "#4ec9b0",
  blocked: "#f44747",
  completed: "#569cd6",
  cancelled: "#555",
};

const statusLabels: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  blocked: "Blocked",
  completed: "Done",
  cancelled: "Cancelled",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function TaskList() {
  const [snapshot, setSnapshot] = useState<TaskSnapshot | null>(null);

  const fetchTasks = useCallback(async () => {
    if (!window.electronAPI?.taskGetSnapshot) return;
    const snap = await window.electronAPI.taskGetSnapshot();
    setSnapshot(snap);
  }, []);

  useEffect(() => {
    fetchTasks();

    if (!window.electronAPI?.onTaskSnapshotChanged) return;
    const unsub = window.electronAPI.onTaskSnapshotChanged((snap) => {
      setSnapshot(snap);
    });
    return unsub;
  }, [fetchTasks]);

  const handleSwitch = useCallback(
    async (taskId: string) => {
      if (!window.electronAPI?.taskSwitch) return;
      await window.electronAPI.taskSwitch(taskId);
      fetchTasks();
    },
    [fetchTasks]
  );

  const handleCancel = useCallback(
    async (taskId: string) => {
      if (!window.electronAPI?.taskCancel) return;
      await window.electronAPI.taskCancel(taskId);
      fetchTasks();
    },
    [fetchTasks]
  );

  const tasks = snapshot?.tasks ?? [];
  const activeId = snapshot?.activeTaskId ?? null;

  // Sort: active first, then pending, then blocked, rest at bottom
  const sorted = [...tasks].sort((a, b) => {
    const order = (s: string) =>
      s === "active" ? 0 : s === "pending" ? 1 : s === "blocked" ? 2 : 3;
    return order(a.status) - order(b.status) || b.priority - a.priority;
  });

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "#0d0d0d",
        fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
        fontSize: 11,
        color: "#a0a0a0",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "4px 10px",
          borderBottom: "1px solid #1a1a1a",
          background: "#111",
          flexShrink: 0,
          gap: 10,
        }}
      >
        <span style={{ color: "#555", fontSize: 10 }}>
          {snapshot
            ? `${snapshot.activeCount} active | ${snapshot.pendingCount} pending | ${snapshot.completedToday} done today`
            : "Loading..."}
        </span>
      </div>

      {/* Task list */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {sorted.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", color: "#333" }}>
            No tasks yet. Start a conversation to create one.
          </div>
        )}
        {sorted.map((task) => (
          <div
            key={task.id}
            style={{
              display: "flex",
              alignItems: "flex-start",
              padding: "6px 10px",
              borderBottom: "1px solid #111",
              background: task.id === activeId ? "rgba(78,201,176,0.05)" : undefined,
              gap: 8,
            }}
          >
            {/* Status dot */}
            <span
              style={{
                display: "inline-block",
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: statusColors[task.status] || "#555",
                marginTop: 3,
                flexShrink: 0,
              }}
              title={statusLabels[task.status]}
            />

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: task.status === "active" ? "#e0e0e0" : task.status === "completed" ? "#666" : "#999",
                  wordBreak: "break-word",
                  textDecoration: task.status === "cancelled" ? "line-through" : undefined,
                }}
              >
                {task.title}
              </div>
              <div style={{ fontSize: 9, color: "#555", marginTop: 1 }}>
                {timeAgo(task.createdAt)}
                {task.plan.length > 0 && ` · ${task.plan.filter((p) => p.status === "completed").length}/${task.plan.length} steps`}
                <span style={{ marginLeft: 6, color: statusColors[task.status] }}>
                  {statusLabels[task.status]}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
              {task.status === "pending" && (
                <button onClick={() => handleSwitch(task.id)} style={actionBtnStyle}>
                  Start
                </button>
              )}
              {(task.status === "active" || task.status === "pending") && (
                <button onClick={() => handleCancel(task.id)} style={{ ...actionBtnStyle, color: "#f44747", borderColor: "#5a1a1a" }}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  background: "#1a1a1a",
  border: "1px solid #333",
  color: "#888",
  borderRadius: 3,
  padding: "1px 8px",
  cursor: "pointer",
  fontSize: 10,
  fontFamily: "inherit",
};
