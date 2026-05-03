/**
 * Core abstraction interfaces for decoupling the agent loop from domain-specific
 * state providers. Plugins implement this interface to contribute dynamic context.
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
 * Plugins contribute StateProvider[] — the agent loop composes them all.
 */
export interface StateProvider {
  /** Stable id for logging and per-provider lifecycle calls. */
  readonly id?: string;

  /** Synchronously return prompt sections for the current state. */
  getContextSections(): PromptSection[];

  /** Optionally build an async snapshot section (e.g., current page state). */
  buildSnapshotSection?(): Promise<PromptSection | null>;

  /** Whether the provider is ready for agent use. */
  isReady(): boolean;

  /** Wait until the provider is ready. */
  waitUntilReady(timeoutMs?: number): Promise<void>;

  /** Human-readable error message when the provider is not ready (optional). */
  getNotReadyMessage?(): string;

  /**
   * Replace the snapshot section in-place with fresh snapshot text after a tool
   * execution refreshes the tree. Provider knows its own snapshot section ID.
   */
  upsertSnapshotSection?(sections: PromptSection[], snapshotText: string): void;

  /** Clear any transient plan-time state captured for stale-detection (optional). */
  clearPlanSnapshots?(): void;

  /** Release resources. */
  cleanup(): void;
}
