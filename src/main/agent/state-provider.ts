/**
 * Re-exports from core/state-provider.ts.
 * Import from "../core/state-provider" in new code.
 */
export type { StateProvider, PromptSection } from "../core/state-provider";

/** @deprecated Use PluginToolContext from ../core/plugin */
export interface ToolFactoryContext {
  browser?: import("../browser/browser-manager").BrowserManager;
  llmClient?: import("./llm-client").LLMClient;
  sendToRenderer?: (channel: string, data: unknown) => void;
}
