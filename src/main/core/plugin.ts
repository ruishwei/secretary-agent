import type { StateProvider } from "./state-provider";
import type { LLMClient } from "../agent/llm-client";
import type { ToolHandler } from "../agent/tool-executor";

// ===== Manifest =====

export interface PluginManifest {
  id: string; // e.g. "browser", "file-explorer"
  name: string;
  version: string;
  description: string;
  icon?: string;
}

// ===== UI Contributions =====

export type ContainerId = "sidebar" | "main" | "bottom-panel" | "float-panel";

export interface UIPanelContribution {
  containerId: ContainerId;
  id: string; // e.g. "browser:browser-view"
  title: string;
  icon?: string;
  defaultVisible?: boolean;
  order?: number;
}

export interface SettingsSectionContribution {
  id: string;
  title: string;
  icon?: string;
  order?: number;
}

// ===== IPC Contributions =====

export interface PluginIPCChannel {
  channel: string;
  handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => Promise<unknown>;
}

// ===== Dependency Contexts =====

export interface PluginToolContext {
  llmClient: LLMClient;
  sendToRenderer: (channel: string, data: unknown) => void;
  getSettings(): Record<string, unknown>;
}

export interface PluginContext {
  getLLMClient(): LLMClient;
  sendToRenderer(channel: string, data: unknown): void;
  getSettings(): Record<string, unknown>;
  getDataPath(): string;
}

// ===== Plugin Interface =====

export interface Plugin {
  manifest: PluginManifest;

  stateProviders?: StateProvider[];

  toolFactories?: Array<(ctx: PluginToolContext) => ToolHandler[]>;

  ipcHandlers?: PluginIPCChannel[];

  uiContributions?: {
    panels?: UIPanelContribution[];
    settingsSections?: SettingsSectionContribution[];
  };

  // Lifecycle
  init(ctx: PluginContext): Promise<void>;
  enable(): Promise<void>;
  disable(): Promise<void>;
  cleanup(): Promise<void>;
}
