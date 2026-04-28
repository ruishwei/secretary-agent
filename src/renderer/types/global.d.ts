import type { ElectronAPI } from "../../main/preload";

// Vite-injected globals (Electron Forge + Vite plugin)
declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
