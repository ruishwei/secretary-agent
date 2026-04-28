import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { AppSettings } from "../../shared/types";
import { DEFAULT_SETTINGS } from "../../shared/types";
import { Logger } from "./logger";

const logger = new Logger("SettingsStore");

const SETTINGS_FILE = "settings.json";

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), SETTINGS_FILE);
}

export function loadSettings(): AppSettings {
  try {
    const filePath = getSettingsPath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const saved = JSON.parse(raw);
      // Merge with defaults to handle missing new fields
      const merged: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...saved,
        llm: { ...DEFAULT_SETTINGS.llm, ...(saved.llm || {}) },
        voice: { ...DEFAULT_SETTINGS.voice, ...(saved.voice || {}) },
        browser: { ...DEFAULT_SETTINGS.browser, ...(saved.browser || {}) },
      };
      logger.info("Settings loaded from disk");
      return merged;
    }
  } catch (err: any) {
    logger.error(`Failed to load settings: ${err.message}`);
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: AppSettings): void {
  try {
    const filePath = getSettingsPath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), "utf-8");
    logger.info("Settings saved to disk");
  } catch (err: any) {
    logger.error(`Failed to save settings: ${err.message}`);
  }
}
