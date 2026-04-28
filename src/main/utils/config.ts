import { app } from "electron";
import path from "node:path";
import fs from "node:fs";

/**
 * Application configuration manager.
 * Reads from electron-store or falls back to defaults.
 */
export interface ConfigData {
  userDataPath: string;
  skillsPath: string;
  memoryPath: string;
  dreamsPath: string;
  sessionsPath: string;
}

let configCache: ConfigData | null = null;

export function getConfig(): ConfigData {
  if (configCache) return configCache;

  const userDataPath = app.getPath("userData");
  const basePath = path.join(userDataPath, "browser-secretary-agent");

  // Ensure directories exist
  for (const dir of [
    basePath,
    path.join(basePath, "skills"),
    path.join(basePath, "memory"),
    path.join(basePath, "memory", ".dreams"),
    path.join(basePath, "sessions"),
  ]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  configCache = {
    userDataPath: basePath,
    skillsPath: path.join(basePath, "skills"),
    memoryPath: path.join(basePath, "memory"),
    dreamsPath: path.join(basePath, "memory", ".dreams"),
    sessionsPath: path.join(basePath, "sessions"),
  };

  return configCache;
}
