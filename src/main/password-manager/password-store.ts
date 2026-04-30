import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { encryptValue, decryptValue } from "../utils/encryption";
import { Logger } from "../utils/logger";
import type { PasswordEntry, PasswordEntryInput } from "../../shared/types";

const logger = new Logger("PwdStore");

function generateId(): string {
  return `pwd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export class PasswordStore {
  private filePath: string;

  constructor() {
    const dir = path.join(app.getPath("userData"), "browser-secretary-agent");
    fs.mkdirSync(dir, { recursive: true });
    this.filePath = path.join(dir, "passwords.json");
  }

  getAll(): PasswordEntry[] {
    const entries = this.readFile();
    return entries.map((e) => ({
      ...e,
      password: decryptValue(e.password),
    }));
  }

  save(input: PasswordEntryInput, id?: string): { success: boolean; error?: string } {
    if (!input.domain || !input.username || !input.password) {
      return { success: false, error: "Domain, username, and password are required" };
    }

    const entries = this.readFile();
    const now = Date.now();

    if (id) {
      const idx = entries.findIndex((e) => e.id === id);
      if (idx < 0) return { success: false, error: "Entry not found" };
      entries[idx] = {
        ...entries[idx],
        ...input,
        password: encryptValue(input.password),
        updatedAt: now,
      };
    } else {
      entries.push({
        id: generateId(),
        domain: input.domain,
        username: input.username,
        password: encryptValue(input.password),
        createdAt: now,
        updatedAt: now,
      });
    }

    this.writeFile(entries);
    logger.info(id ? `Updated password entry ${id}` : "Created new password entry");
    return { success: true };
  }

  delete(id: string): { success: boolean; error?: string } {
    const entries = this.readFile();
    const idx = entries.findIndex((e) => e.id === id);
    if (idx < 0) return { success: false, error: "Entry not found" };

    entries.splice(idx, 1);
    this.writeFile(entries);
    logger.info(`Deleted password entry ${id}`);
    return { success: true };
  }

  private readFile(): PasswordEntry[] {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
      }
    } catch (err: any) {
      logger.error(`Failed to read passwords: ${err.message}`);
    }
    return [];
  }

  private writeFile(entries: PasswordEntry[]): void {
    fs.writeFileSync(this.filePath, JSON.stringify(entries, null, 2), "utf-8");
  }
}
