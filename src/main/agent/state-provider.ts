/**
 * Core abstraction interfaces for decoupling the agent loop from domain-specific
 * state providers. Implemented by BrowserStateProvider, and in the future by
 * MemoryStateProvider, SkillProvider, etc.
 */

/** A section of the system prompt contributed by a domain provider. */
export interface PromptSection {
  /** Unique identifier for deduplication (e.g., "browser:tabs", "memory:index"). */
  id: string;
  /** The prompt text to inject. */
  content: string;
  /** Lower = appears earlier in the prompt (default 50). */
  priority: number;
}

/**
 * Abstraction for anything that provides dynamic context to the agent loop.
 * BrowserManager implements this via BrowserStateProvider; future providers
 * (memory, skills) can implement it too.
 */
export interface StateProvider {
  /** Synchronously return prompt sections for the current state. */
  getContextSections(): PromptSection[];

  /** Optionally build an async snapshot section (e.g., accessibility tree). */
  buildSnapshotSection?(): Promise<PromptSection | null>;

  /** Whether the provider is ready for agent use. */
  isReady(): boolean;

  /** Wait until the provider is ready (CDP attached, etc.). */
  waitUntilReady(timeoutMs?: number): Promise<void>;

  /** Release resources. */
  cleanup(): void;
}

/** Dependencies provided to tool factories at registration time. */
export interface ToolFactoryContext {
  browser?: import("../browser/browser-manager").BrowserManager;
  llmClient?: import("./llm-client").LLMClient;
  sendToRenderer?: (channel: string, data: unknown) => void;
}
