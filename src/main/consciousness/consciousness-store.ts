import fs from "node:fs";
import path from "node:path";
import { Logger } from "../utils/logger";
import type { AgentEvent } from "../../shared/types";

const logger = new Logger("Consciousness");

export interface ConsciousnessEntry {
  id: string;
  taskId: string;
  timestamp: number;
  direction: "in" | "out";
  eventType: string;
  summary: string;
  detail?: string;
  tokenCount?: number;
}

/**
 * Real-time LLM exchange recorder.
 * Captures agent events into per-task streams that the renderer can visualize.
 * Data persists to disk and auto-expires after a configurable retention period.
 */
export class ConsciousnessStore {
  private streams = new Map<string, ConsciousnessEntry[]>();
  private dataDir: string;
  private maxEntriesPerTask = 500;
  private retentionDays = 7;
  private entryCounter = 0;

  constructor(dataDir: string) {
    this.dataDir = path.join(dataDir, "consciousness");
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.purgeExpired();
  }

  /** Record an agent event for the given task. */
  recordEvent(taskId: string, event: AgentEvent): void {
    const entry = this.eventToEntry(taskId, event);
    if (!entry) return;

    let stream = this.streams.get(taskId);
    if (!stream) {
      stream = [];
      this.streams.set(taskId, stream);
    }

    stream.push(entry);

    // Trim if over max
    if (stream.length > this.maxEntriesPerTask) {
      stream.splice(0, stream.length - this.maxEntriesPerTask);
    }
  }

  /** Get the full stream for a task (newest first). */
  getStream(taskId: string): ConsciousnessEntry[] {
    const stream = this.streams.get(taskId);
    if (stream) return [...stream].reverse();
    return [];
  }

  /** Get list of active task IDs (tasks with entries). */
  getActiveTaskIds(): string[] {
    return [...this.streams.keys()];
  }

  /** Get recent entries across all tasks (for the "all streams" view). */
  getRecentEntries(limit = 50): ConsciousnessEntry[] {
    const all: ConsciousnessEntry[] = [];
    for (const stream of this.streams.values()) {
      all.push(...stream);
    }
    all.sort((a, b) => b.timestamp - a.timestamp);
    return all.slice(0, limit);
  }

  /** Save a task's stream to disk and remove from memory. */
  saveToDisk(taskId: string): void {
    const stream = this.streams.get(taskId);
    if (!stream || stream.length === 0) return;

    const filePath = path.join(this.dataDir, taskId + ".jsonl");
    const lines = stream.map((e) => JSON.stringify(e)).join("\n") + "\n";

    try {
      fs.writeFileSync(filePath, lines, "utf-8");
      logger.info("Saved consciousness stream: " + taskId + " (" + stream.length + " entries)");
      this.streams.delete(taskId);
    } catch (err: any) {
      logger.error("Failed to save stream: " + err.message);
    }
  }

  /** Load a task's stream from disk into memory. */
  loadFromDisk(taskId: string): ConsciousnessEntry[] {
    const filePath = path.join(this.dataDir, taskId + ".jsonl");
    if (!fs.existsSync(filePath)) return [];

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const entries = content
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as ConsciousnessEntry);
      return entries;
    } catch {
      return [];
    }
  }

  /** Delete streams older than retention period. */
  purgeExpired(): number {
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    let purged = 0;

    if (!fs.existsSync(this.dataDir)) return 0;

    for (const file of fs.readdirSync(this.dataDir)) {
      if (!file.endsWith(".jsonl")) continue;
      try {
        const filePath = path.join(this.dataDir, file);
        const stat = fs.statSync(filePath);
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
          purged++;
        }
      } catch {
        // skip
      }
    }

    if (purged > 0) logger.info("Purged " + purged + " expired consciousness streams");
    return purged;
  }

  /** Delete a specific task's stream (memory + disk). */
  deleteStream(taskId: string): void {
    this.streams.delete(taskId);
    const filePath = path.join(this.dataDir, taskId + ".jsonl");
    try { fs.unlinkSync(filePath); } catch { /* may not exist */ }
  }

  // ============ Event → Entry Conversion ============

  private eventToEntry(taskId: string, event: AgentEvent): ConsciousnessEntry | null {
    const id = "cse-" + (++this.entryCounter);
    const timestamp = Date.now();

    switch (event.type) {
      case "thinking":
        return {
          id, taskId, timestamp,
          direction: "out",
          eventType: "thinking",
          summary: event.plan?.slice(0, 120) || "Thinking...",
          detail: event.reasoning || event.plan,
        };

      case "response":
        return {
          id, taskId, timestamp,
          direction: "out",
          eventType: "response",
          summary: "Response: " + (event.text?.slice(0, 100) || ""),
          detail: event.text,
        };

      case "tool-start":
        return {
          id, taskId, timestamp: event.timestamp || timestamp,
          direction: "out",
          eventType: "tool-call",
          summary: "Tool: " + event.tool + "(" + JSON.stringify(event.args).slice(0, 80) + ")",
          detail: JSON.stringify(event.args, null, 2),
        };

      case "tool-result":
        return {
          id, taskId, timestamp,
          direction: "in",
          eventType: event.success ? "tool-result" : "tool-error",
          summary: (event.success ? "OK" : "ERR") + ": " + event.tool + " (" + (event.durationMs || 0) + "ms)",
          detail: event.result?.slice(0, 500) + (event.error ? " | Error: " + event.error : ""),
        };

      case "tool-progress":
        return {
          id, taskId, timestamp,
          direction: "in",
          eventType: "tool-progress",
          summary: "Progress: " + (event.content?.slice(0, 100) || ""),
          detail: event.content,
        };

      case "plan-update":
        return {
          id, taskId, timestamp,
          direction: "out",
          eventType: "plan",
          summary: "Plan: " + (event.items as any[])?.map((i: any) => i.text).join(" | ").slice(0, 120) || "Updated",
          detail: JSON.stringify(event.items, null, 2),
        };

      case "review-required":
        return {
          id, taskId, timestamp,
          direction: "out",
          eventType: "review",
          summary: "Review: " + (event.title || "Required"),
          detail: event.description,
        };

      case "done":
        return {
          id, taskId, timestamp,
          direction: "out",
          eventType: "done",
          summary: "Done: " + (event.summary?.slice(0, 120) || "Task complete"),
          detail: event.summary,
        };

      case "error":
        return {
          id, taskId, timestamp,
          direction: "out",
          eventType: "error",
          summary: "Error: " + (event.message?.slice(0, 120) || "Unknown error"),
          detail: event.message,
        };

      default:
        return null;
    }
  }
}
