import fs from "node:fs";
import path from "node:path";
import { Logger } from "../utils/logger";

const logger = new Logger("Memory");

/**
 * Memory Hierarchy:
 *   Deep   - MEMORY.md, always loaded (core identity, promoted facts, persistent)
 *   Shallow - shallow/YYYY-MM-DD.md, daily fragments, auto-purge after retention days
 *   User   - USER.md, always loaded (user profile/preferences, persistent)
 *   Sessions - sessions/*.jsonl, searchable transcripts
 *
 * Processing:
 *   - Dedup: skip writes that match an existing entry closely
 *   - Promotion: shallow entries accessed >= promotionThreshold times move to deep
 *   - Decay: shallow files older than shallowRetentionDays are deleted
 */

const DEEP_INDEX_FILE = "MEMORY.md";
const USER_FILE = "USER.md";
const SHALLOW_DIR = "shallow";
const DEEP_DIR = "deep";
const ENTRY_DELIMITER = "\n\xA7\n"; // § = section sign
const MAX_DEEP_CHARS = 3000;
const MAX_USER_CHARS = 1500;
const MAX_SHALLOW_DAILY_CHARS = 2500;

// Invisible Unicode ranges used for prompt injection detection
const INVISIBLE_PATTERN =
  "[​-‏  ﻿]";

export interface SearchResult {
  path: string;
  snippet: string;
  score: number;
  layer: "deep" | "shallow" | "user" | "session";
  timestamp?: string;
}

export interface SessionSearchResult {
  timestamp: string;
  snippet: string;
}

export class MemoryStore {
  private deepIndexFile: string;
  private userFile: string;
  private shallowDir: string;
  private deepFragmentsDir: string;
  private sessionsDir: string;
  private accessLogFile: string;

  // Config
  readonly shallowRetentionDays = 7;
  readonly promotionThreshold = 3;

  // In-memory access tracker: key -> count
  private accessCounts = new Map<string, number>();

  constructor(memoryPath: string, sessionsPath: string) {
    this.deepIndexFile = path.join(memoryPath, DEEP_INDEX_FILE);
    this.userFile = path.join(memoryPath, USER_FILE);
    this.shallowDir = path.join(memoryPath, SHALLOW_DIR);
    this.deepFragmentsDir = path.join(memoryPath, DEEP_DIR);
    this.sessionsDir = sessionsPath;
    this.accessLogFile = path.join(memoryPath, ".access-log.json");

    fs.mkdirSync(memoryPath, { recursive: true });
    fs.mkdirSync(this.shallowDir, { recursive: true });
    fs.mkdirSync(this.deepFragmentsDir, { recursive: true });
    fs.mkdirSync(sessionsPath, { recursive: true });

    this.loadAccessLog();
    this.purgeExpiredShallow();
  }

  // ============ Reading (for system prompt) ============

  /** Deep memory snapshot - always loaded into system prompt. */
  getMemorySnapshot(): string {
    if (!fs.existsSync(this.deepIndexFile)) return "";
    const content = fs.readFileSync(this.deepIndexFile, "utf-8");
    return this.sanitizeContent(content);
  }

  /** User profile snapshot - always loaded into system prompt. */
  getUserProfile(): string {
    if (!fs.existsSync(this.userFile)) return "";
    const content = fs.readFileSync(this.userFile, "utf-8");
    return this.sanitizeContent(content);
  }

  /**
   * Get recent shallow memories as context.
   * Returns entries from the last N days, capped at maxChars.
   */
  getRecentShallow(days = 3, maxChars = 1500): string {
    const shallowFiles = this.getShallowFiles();
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const parts: string[] = [];
    let charCount = 0;

    for (const file of shallowFiles) {
      const dateStr = file.replace(".md", "");
      const fileTime = new Date(dateStr).getTime();
      if (fileTime < cutoff) continue;

      try {
        const content = fs.readFileSync(path.join(this.shallowDir, file), "utf-8");
        for (const entry of content.split(ENTRY_DELIMITER)) {
          const trimmed = entry.trim();
          if (!trimmed) continue;
          if (charCount + trimmed.length > maxChars) break;
          parts.push(trimmed);
          charCount += trimmed.length;
        }
      } catch {
        // skip unreadable files
      }
      if (charCount >= maxChars) break;
    }

    return parts.join(ENTRY_DELIMITER);
  }

  // ============ Writing ============

  add(
    target: "shallow" | "deep" | "user",
    entry: string,
  ): { success: boolean; error?: string; deduped?: boolean } {
    const scanResult = this.scanEntry(entry);
    if (!scanResult.ok) {
      return { success: false, error: scanResult.reason };
    }

    if (target === "shallow") {
      return this.addToShallow(entry);
    } else if (target === "deep") {
      return this.addToDeep(entry);
    } else {
      return this.addToUser(entry);
    }
  }

  private addToShallow(entry: string): { success: boolean; error?: string; deduped?: boolean } {
    // Dedup check against all recent shallow entries
    const dupKey = this.findDup(entry, this.shallowDir);
    if (dupKey) {
      this.trackAccess(dupKey);
      return { success: true, deduped: true };
    }

    const today = this.todayFile();
    const filePath = path.join(this.shallowDir, today);

    try {
      let content = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "";
      if (content.length > 0) content += ENTRY_DELIMITER;
      content += entry.trim();
      content = this.prune(content, MAX_SHALLOW_DAILY_CHARS);
      fs.writeFileSync(filePath, content, "utf-8");

      const key = "shallow:" + today + ":" + this.hashEntry(entry);
      this.trackAccess(key);
      logger.info("Added shallow memory: " + entry.substring(0, 80) + "...");
      return { success: true };
    } catch (err: any) {
      return { success: false, error: "Failed to write shallow: " + err.message };
    }
  }

  private addToDeep(entry: string): { success: boolean; error?: string; deduped?: boolean } {
    const dupKey = this.findDup(entry, this.deepFragmentsDir);
    if (dupKey) {
      this.trackAccess(dupKey);
      return { success: true, deduped: true };
    }

    // Also check the deep index file for dups
    if (fs.existsSync(this.deepIndexFile)) {
      const indexContent = fs.readFileSync(this.deepIndexFile, "utf-8");
      if (this.isSimilar(entry, indexContent)) {
        return { success: true, deduped: true };
      }
    }

    try {
      let content = fs.existsSync(this.deepIndexFile)
        ? fs.readFileSync(this.deepIndexFile, "utf-8")
        : "";
      if (content.length > 0) content += ENTRY_DELIMITER;
      content += entry.trim();
      content = this.prune(content, MAX_DEEP_CHARS);
      fs.writeFileSync(this.deepIndexFile, content, "utf-8");

      const key = "deep:" + this.hashEntry(entry);
      this.trackAccess(key);
      logger.info("Added deep memory: " + entry.substring(0, 80) + "...");
      return { success: true };
    } catch (err: any) {
      return { success: false, error: "Failed to write deep: " + err.message };
    }
  }

  private addToUser(entry: string): { success: boolean; error?: string; deduped?: boolean } {
    if (fs.existsSync(this.userFile)) {
      const content = fs.readFileSync(this.userFile, "utf-8");
      if (this.isSimilar(entry, content)) {
        return { success: true, deduped: true };
      }
    }

    try {
      let content = fs.existsSync(this.userFile)
        ? fs.readFileSync(this.userFile, "utf-8")
        : "";
      if (content.length > 0) content += ENTRY_DELIMITER;
      content += entry.trim();
      content = this.prune(content, MAX_USER_CHARS);
      fs.writeFileSync(this.userFile, content, "utf-8");

      const key = "user:" + this.hashEntry(entry);
      this.trackAccess(key);
      logger.info("Added user memory: " + entry.substring(0, 80) + "...");
      return { success: true };
    } catch (err: any) {
      return { success: false, error: "Failed to write user: " + err.message };
    }
  }

  // ============ Replace ============

  replace(
    target: "deep" | "user",
    oldStr: string,
    newStr: string,
  ): { success: boolean; error?: string } {
    const file = target === "deep" ? this.deepIndexFile : this.userFile;
    if (!fs.existsSync(file)) {
      return { success: false, error: (target === "deep" ? "MEMORY.md" : "USER.md") + " does not exist yet" };
    }

    const scanResult = this.scanEntry(newStr);
    if (!scanResult.ok) {
      return { success: false, error: scanResult.reason };
    }

    try {
      let content = fs.readFileSync(file, "utf-8");
      if (!content.includes(oldStr)) {
        return { success: false, error: "Entry not found" };
      }
      content = content.replace(oldStr, newStr);
      fs.writeFileSync(file, content, "utf-8");
      logger.info("Replaced entry in " + target);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: "Failed to write: " + err.message };
    }
  }

  // ============ Search ============

  search(
    query: string,
    maxResults = 5,
    minScore = 0.3,
  ): SearchResult[] {
    const results: SearchResult[] = [];

    // Search deep index
    if (fs.existsSync(this.deepIndexFile)) {
      const content = fs.readFileSync(this.deepIndexFile, "utf-8");
      for (const entry of content.split(ENTRY_DELIMITER)) {
        if (entry.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            path: "MEMORY.md",
            snippet: entry.trim().slice(0, 400),
            score: 0,
            layer: "deep",
          });
        }
      }
    }

    // Search user profile
    if (fs.existsSync(this.userFile)) {
      const content = fs.readFileSync(this.userFile, "utf-8");
      for (const entry of content.split(ENTRY_DELIMITER)) {
        if (entry.toLowerCase().includes(query.toLowerCase())) {
          results.push({
            path: "USER.md",
            snippet: entry.trim().slice(0, 400),
            score: 0,
            layer: "user",
          });
        }
      }
    }

    // Search shallow memories
    const shallowFiles = this.getShallowFiles();
    for (const file of shallowFiles) {
      try {
        const content = fs.readFileSync(path.join(this.shallowDir, file), "utf-8");
        for (const entry of content.split(ENTRY_DELIMITER)) {
          if (entry.toLowerCase().includes(query.toLowerCase())) {
            results.push({
              path: "shallow/" + file,
              snippet: entry.trim().slice(0, 400),
              score: 0,
              layer: "shallow",
              timestamp: file.replace(".md", ""),
            });
          }
        }
      } catch {
        // skip
      }
    }

    // Search deep fragments directory
    if (fs.existsSync(this.deepFragmentsDir)) {
      for (const file of fs.readdirSync(this.deepFragmentsDir)) {
        if (!file.endsWith(".md")) continue;
        try {
          const content = fs.readFileSync(path.join(this.deepFragmentsDir, file), "utf-8");
          for (const entry of content.split(ENTRY_DELIMITER)) {
            if (entry.toLowerCase().includes(query.toLowerCase())) {
              results.push({
                path: "deep/" + file,
                snippet: entry.trim().slice(0, 400),
                score: 0,
                layer: "deep",
              });
            }
          }
        } catch {
          // skip
        }
      }
    }

    // Score and sort
    const scored = results
      .map((r) => ({ ...r, score: this.computeScore(r.snippet, query) }))
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, maxResults);
  }

  /** Search session transcripts. */
  searchSessions(query: string, maxResults = 5): SessionSearchResult[] {
    const results: SessionSearchResult[] = [];
    if (!fs.existsSync(this.sessionsDir)) return results;

    const files = fs.readdirSync(this.sessionsDir)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse();

    for (const file of files) {
      if (results.length >= maxResults) break;
      try {
        const content = fs.readFileSync(path.join(this.sessionsDir, file), "utf-8");
        const lines = content.split("\n").filter(Boolean);
        for (const line of lines) {
          if (results.length >= maxResults) break;
          if (line.toLowerCase().includes(query.toLowerCase())) {
            results.push({
              timestamp: file.replace(".jsonl", ""),
              snippet: line.length > 300 ? line.slice(0, 300) + "..." : line,
            });
          }
        }
      } catch {
        // Skip unreadable
      }
    }
    return results;
  }

  // ============ Session Save ============

  saveSession(messages: Array<{ role: string; content: string }>): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(this.sessionsDir, timestamp + ".jsonl");
    const lines = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
    fs.writeFileSync(filePath, lines, "utf-8");
    logger.info("Session saved: " + timestamp);
  }

  // ============ Promotion ============

  /** Promote a shallow memory to deep if it's been accessed enough times. */
  promoteIfEligible(key: string): boolean {
    const count = this.accessCounts.get(key) || 0;
    if (count < this.promotionThreshold) return false;

    // Key format: "shallow:YYYY-MM-DD:hash"
    if (!key.startsWith("shallow:")) return false;

    const parts = key.split(":");
    const date = parts[1];
    const entryHash = parts[2];

    // Find the entry in the shallow file
    const filePath = path.join(this.shallowDir, date + ".md");
    if (!fs.existsSync(filePath)) return false;

    try {
      const content = fs.readFileSync(filePath, "utf-8");
      for (const entry of content.split(ENTRY_DELIMITER)) {
        const trimmed = entry.trim();
        if (!trimmed) continue;
        if (this.hashEntry(trimmed) === entryHash) {
          // Promote to deep
          this.addToDeep(trimmed);
          // Remove from shallow
          const newContent = content
            .split(ENTRY_DELIMITER)
            .filter((e) => e.trim() !== trimmed)
            .join(ENTRY_DELIMITER);
          fs.writeFileSync(filePath, newContent, "utf-8");
          logger.info("Promoted shallow -> deep: " + trimmed.substring(0, 80) + "...");
          this.accessCounts.delete(key);
          return true;
        }
      }
    } catch {
      // skip
    }
    return false;
  }

  // ============ Maintenance ============

  /** Delete shallow files older than retention period. Returns count purged. */
  purgeExpiredShallow(): number {
    const cutoff = Date.now() - this.shallowRetentionDays * 24 * 60 * 60 * 1000;
    let purged = 0;

    if (!fs.existsSync(this.shallowDir)) return 0;

    for (const file of fs.readdirSync(this.shallowDir)) {
      if (!file.endsWith(".md")) continue;
      const dateStr = file.replace(".md", "");
      const fileTime = new Date(dateStr).getTime();
      if (isNaN(fileTime)) continue;
      if (fileTime < cutoff) {
        try {
          fs.unlinkSync(path.join(this.shallowDir, file));
          purged++;
        } catch {
          // skip
        }
      }
    }

    if (purged > 0) {
      logger.info("Purged " + purged + " expired shallow memories");
    }
    return purged;
  }

  // ============ Private Helpers ============

  private todayFile(): string {
    const now = new Date();
    return now.getFullYear() + "-" +
      String(now.getMonth() + 1).padStart(2, "0") + "-" +
      String(now.getDate()).padStart(2, "0") + ".md";
  }

  private getShallowFiles(): string[] {
    if (!fs.existsSync(this.shallowDir)) return [];
    return fs.readdirSync(this.shallowDir)
      .filter((f) => f.endsWith(".md"))
      .sort()
      .reverse();
  }

  private hashEntry(entry: string): string {
    let hash = 0;
    const normalized = entry.trim().toLowerCase().replace(/\s+/g, " ");
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).slice(0, 8);
  }

  /** Check if an entry is similar to existing content (simple substring overlap). */
  private isSimilar(entry: string, existing: string): boolean {
    const normalizedEntry = entry.trim().toLowerCase().replace(/\s+/g, " ");
    const normalizedExisting = existing.toLowerCase().replace(/\s+/g, " ");

    // Existing already contains the full new entry — definitely a dup
    if (normalizedExisting.includes(normalizedEntry)) return true;

    // New entry contains the existing one — only suppress if it's essentially the same
    // (old is >= 80% of new length), meaning new adds negligible new info
    if (normalizedEntry.includes(normalizedExisting)) {
      const ratio = normalizedExisting.length / normalizedEntry.length;
      if (ratio >= 0.8) return true;
    }

    // Check first-sentence overlap for longer entries (catch rephrases)
    const entryFirstSentence = normalizedEntry.split(/[.!?]/)[0]?.trim();
    if (entryFirstSentence && entryFirstSentence.length > 30) {
      if (normalizedExisting.includes(entryFirstSentence)) return true;
    }

    return false;
  }

  /** Find a duplicate entry in a directory of markdown files. */
  private findDup(entry: string, dir: string): string | null {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(dir, file), "utf-8");
        if (this.isSimilar(entry, content)) {
          const prefix = dir === this.shallowDir ? "shallow" : "deep";
          return prefix + ":" + file + ":" + this.hashEntry(entry);
        }
      } catch {
        // skip
      }
    }
    return null;
  }

  private computeScore(snippet: string, query: string): number {
    const lower = snippet.toLowerCase();
    const q = query.toLowerCase();

    if (lower.includes(q)) {
      const ratio = q.length / lower.length;
      return 0.5 + ratio * 0.5;
    }

    const queryWords = q.split(/\s+/);
    const matchedWords = queryWords.filter((w) => lower.includes(w));
    return (matchedWords.length / queryWords.length) * 0.5;
  }

  private prune(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content;
    const entries = content.split(ENTRY_DELIMITER);
    while (entries.length > 1 && entries.join(ENTRY_DELIMITER).length > maxChars) {
      entries.shift();
    }
    return entries.join(ENTRY_DELIMITER);
  }

  private trackAccess(key: string): void {
    const count = (this.accessCounts.get(key) || 0) + 1;
    this.accessCounts.set(key, count);
    this.saveAccessLog();
    this.promoteIfEligible(key);
  }

  // ============ Access Log Persistence ============

  private loadAccessLog(): void {
    try {
      if (fs.existsSync(this.accessLogFile)) {
        const data = JSON.parse(fs.readFileSync(this.accessLogFile, "utf-8"));
        for (const [key, count] of Object.entries(data)) {
          this.accessCounts.set(key, count as number);
        }
      }
    } catch {
      // start fresh
    }
  }

  private saveAccessLog(): void {
    try {
      const data: Record<string, number> = {};
      for (const [key, count] of this.accessCounts) {
        data[key] = count;
      }
      fs.writeFileSync(this.accessLogFile, JSON.stringify(data, null, 2), "utf-8");
    } catch {
      // non-critical
    }
  }

  // ============ Prompt Injection Guard ============

  private invisibleRegex: RegExp | null = null;

  private getInvisibleRegex(): RegExp {
    if (!this.invisibleRegex) {
      this.invisibleRegex = new RegExp(INVISIBLE_PATTERN, "g");
    }
    return this.invisibleRegex;
  }

  private sanitizeContent(content: string): string {
    return content
      .replace(this.getInvisibleRegex(), "")
      .replace(/\[system\]/gi, "[sys]")
      .replace(/\[assistant\]/gi, "[asst]")
      .replace(/\[human\]/gi, "[user]");
  }

  private scanEntry(entry: string): { ok: boolean; reason?: string } {
    if (/\b(system|assistant|human):\s*\n/i.test(entry)) {
      return { ok: false, reason: "Entry contains role injection markers" };
    }
    if (this.getInvisibleRegex().test(entry)) {
      return { ok: false, reason: "Entry contains invisible Unicode characters" };
    }
    return { ok: true };
  }
}
