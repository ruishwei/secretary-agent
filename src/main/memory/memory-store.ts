import fs from "node:fs";
import path from "node:path";
import { Logger } from "../utils/logger";

const logger = new Logger("Memory");

const MAX_MEMORY_CHARS = 2200;
const MAX_USER_PROFILE_CHARS = 1375;
const ENTRY_DELIMITER = "\n§\n";

export class MemoryStore {
  private memoryPath: string;
  private sessionsPath: string;
  private memoryFile: string;
  private userFile: string;

  constructor(memoryPath: string, sessionsPath: string) {
    this.memoryPath = memoryPath;
    this.sessionsPath = sessionsPath;
    this.memoryFile = path.join(memoryPath, "MEMORY.md");
    this.userFile = path.join(memoryPath, "USER.md");

    // Ensure directories exist
    fs.mkdirSync(memoryPath, { recursive: true });
    fs.mkdirSync(sessionsPath, { recursive: true });
  }

  /** Read the frozen memory snapshot for the system prompt. */
  getMemorySnapshot(): string {
    if (!fs.existsSync(this.memoryFile)) return "";
    const content = fs.readFileSync(this.memoryFile, "utf-8");
    return this.scanContent(content).slice(0, MAX_MEMORY_CHARS);
  }

  /** Read the user profile for the system prompt. */
  getUserProfile(): string {
    if (!fs.existsSync(this.userFile)) return "";
    const content = fs.readFileSync(this.userFile, "utf-8");
    return this.scanContent(content).slice(0, MAX_USER_PROFILE_CHARS);
  }

  /** Add an entry to MEMORY.md or USER.md. */
  add(target: "memory" | "user", entry: string): { success: boolean; error?: string } {
    const file = target === "memory" ? this.memoryFile : this.userFile;
    const maxChars = target === "memory" ? MAX_MEMORY_CHARS : MAX_USER_PROFILE_CHARS;

    // Scan entry for prompt injection
    const scanResult = this.scanEntry(entry);
    if (!scanResult.ok) {
      return { success: false, error: scanResult.reason };
    }

    try {
      let content = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";

      // Append with delimiter
      if (content.length > 0) {
        content += ENTRY_DELIMITER;
      }
      content += entry.trim();

      // Prune old entries if over limit
      content = this.prune(content, maxChars);

      fs.writeFileSync(file, content, "utf-8");
      logger.info(`Added entry to ${target}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Failed to write: ${err.message}` };
    }
  }

  /** Find and replace an entry in MEMORY.md or USER.md. */
  replace(target: "memory" | "user", oldStr: string, newStr: string): { success: boolean; error?: string } {
    const file = target === "memory" ? this.memoryFile : this.userFile;

    if (!fs.existsSync(file)) {
      return { success: false, error: `${target.toUpperCase()}.md does not exist yet` };
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
      logger.info(`Replaced entry in ${target}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Failed to write: ${err.message}` };
    }
  }

  /** Full-text search across memory files. */
  search(query: string, maxResults = 5, minScore = 0.3): Array<{ path: string; snippet: string; score: number }> {
    const results: Array<{ path: string; snippet: string; score: number }> = [];

    // Search MEMORY.md
    if (fs.existsSync(this.memoryFile)) {
      results.push(...this.searchFile(this.memoryFile, "MEMORY.md", query));
    }

    // Search USER.md
    if (fs.existsSync(this.userFile)) {
      results.push(...this.searchFile(this.userFile, "USER.md", query));
    }

    // Score and sort
    const scored = results
      .map((r) => ({
        ...r,
        score: this.computeScore(r.snippet, query),
      }))
      .filter((r) => r.score >= minScore)
      .sort((a, b) => b.score - a.score);

    return scored.slice(0, maxResults);
  }

  /** Search session transcripts. */
  searchSessions(query: string, maxResults = 5): Array<{ timestamp: string; snippet: string }> {
    const results: Array<{ timestamp: string; snippet: string }> = [];

    if (!fs.existsSync(this.sessionsPath)) return results;

    const files = fs.readdirSync(this.sessionsPath)
      .filter((f) => f.endsWith(".jsonl"))
      .sort()
      .reverse();

    for (const file of files) {
      if (results.length >= maxResults) break;
      const filePath = path.join(this.sessionsPath, file);
      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n").filter(Boolean);
        for (const line of lines) {
          if (results.length >= maxResults) break;
          if (line.toLowerCase().includes(query.toLowerCase())) {
            const snippet = line.length > 300 ? line.slice(0, 300) + "..." : line;
            results.push({
              timestamp: file.replace(".jsonl", ""),
              snippet,
            });
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return results;
  }

  /** Save a session transcript. */
  saveSession(messages: Array<{ role: string; content: string }>): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filePath = path.join(this.sessionsPath, `${timestamp}.jsonl`);

    const lines = messages.map((m) => JSON.stringify(m)).join("\n") + "\n";
    fs.writeFileSync(filePath, lines, "utf-8");
    logger.info(`Session saved: ${timestamp}`);
  }

  // ===== Private helpers =====

  private searchFile(filePath: string, label: string, query: string): Array<{ path: string; snippet: string; score: number }> {
    const results: Array<{ path: string; snippet: string; score: number }> = [];
    const content = fs.readFileSync(filePath, "utf-8");
    const lower = query.toLowerCase();

    // Split into entries and search
    const entries = content.split(ENTRY_DELIMITER);
    for (const entry of entries) {
      if (entry.toLowerCase().includes(lower)) {
        results.push({
          path: label,
          snippet: entry.length > 400 ? entry.slice(0, 400) + "..." : entry,
          score: 0, // Computed later
        });
      }
    }

    return results;
  }

  private computeScore(snippet: string, query: string): number {
    const lower = snippet.toLowerCase();
    const q = query.toLowerCase();

    // Exact match = highest score
    if (lower.includes(q)) {
      // More query coverage = higher score
      const ratio = q.length / lower.length;
      return 0.5 + ratio * 0.5;
    }

    // Word-level matching
    const queryWords = q.split(/\s+/);
    const matchedWords = queryWords.filter((w) => lower.includes(w));
    return matchedWords.length / queryWords.length * 0.5;
  }

  /** Prune old entries when content exceeds maxChars. */
  private prune(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content;
    const entries = content.split(ENTRY_DELIMITER);
    // Remove oldest entries first
    while (entries.length > 1 && entries.join(ENTRY_DELIMITER).length > maxChars) {
      entries.shift();
    }
    return entries.join(ENTRY_DELIMITER);
  }

  // ZWSP–RLM range, Line Separator, Paragraph Separator, BOM
  private INVISIBLE_RX = /[\u200B-\u200F\u2028\u2029\uFEFF]/g;

  /** Basic prompt-injection guard. */
  private scanContent(content: string): string {
    // Strip invisible unicode that could be used for prompt injection
    return content
      .replace(this.INVISIBLE_RX, "")
      .replace(/\[system\]/gi, "[sys]")
      .replace(/\[assistant\]/gi, "[asst]")
      .replace(/\[human\]/gi, "[user]");
  }

  private scanEntry(entry: string): { ok: boolean; reason?: string } {
    // Reject role injection markers
    if (/\b(system|assistant|human):\s*\n/i.test(entry)) {
      return { ok: false, reason: "Entry contains role injection markers" };
    }
    // Reject invisible unicode
    if (this.INVISIBLE_RX.test(entry)) {
      return { ok: false, reason: "Entry contains invisible Unicode characters" };
    }
    return { ok: true };
  }
}
