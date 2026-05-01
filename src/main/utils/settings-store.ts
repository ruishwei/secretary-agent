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

      // Migration: old single llm object → new multi-config llmConfigs array
      if (saved.llm && !saved.llmConfigs) {
        saved.llmConfigs = [{
          id: "cfg-legacy",
          name: saved.llm.provider === "anthropic" ? "Claude" : "OpenAI",
          provider: saved.llm.provider || "anthropic",
          apiKey: saved.llm.apiKey || "",
          model: saved.llm.model || "claude-sonnet-4-6",
          maxTokens: saved.llm.maxTokens || 4096,
          baseUrl: saved.llm.baseUrl,
          supportsVision: true,
        }];
        saved.activeLlmConfigId = "cfg-legacy";
        delete saved.llm;
      }

      // Merge with defaults to handle missing new fields
      const merged: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...saved,
        llmConfigs: saved.llmConfigs || DEFAULT_SETTINGS.llmConfigs,
        activeLlmConfigId: saved.activeLlmConfigId || DEFAULT_SETTINGS.activeLlmConfigId,
        voice: { ...DEFAULT_SETTINGS.voice, ...(saved.voice || {}) },
        browser: { ...DEFAULT_SETTINGS.browser, ...(saved.browser || {}) },
        privacy: { ...DEFAULT_SETTINGS.privacy, ...(saved.privacy || {}) },
        workspace: { ...DEFAULT_SETTINGS.workspace, ...(saved.workspace || {}) },
        shortcuts: { ...DEFAULT_SETTINGS.shortcuts, ...(saved.shortcuts || {}) },
        language: saved.language || DEFAULT_SETTINGS.language,
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
