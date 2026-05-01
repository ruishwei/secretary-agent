import { BrowserManager } from "./browser-manager";
import type { StateProvider, PromptSection } from "../agent/state-provider";

/**
 * Adapts BrowserManager to the StateProvider interface for use by the generic AgentLoop.
 */
export class BrowserStateProvider implements StateProvider {
  constructor(private browserManager: BrowserManager) {}

  getContextSections(): PromptSection[] {
    const sections: PromptSection[] = [];
    const allTabs = this.browserManager.getAllTabs();
    const pageState = this.browserManager.getPageState();

    // Tab list
    if (allTabs.length > 0) {
      const tabLines = allTabs.map((t) =>
        `${t.isActive ? "> " : "  "}[${t.tabId}] ${t.title || "(no title)"} — ${t.url}${t.isActive ? " (active)" : ""}`
      );
      sections.push({
        id: "browser:tabs",
        priority: 10,
        content: `## Open Tabs\n${tabLines.join("\n")}\n\nUse the tabId with browser tools to operate on specific tabs. Use browser_new_tab, browser_close_tab, browser_switch_tab, and browser_list_tabs to manage tabs.`,
      });
    }

    // Current page
    if (pageState.url) {
      const activeSession = this.browserManager.getActiveSession();
      const tabId = activeSession?.tabId || "";
      sections.push({
        id: "browser:page",
        priority: 20,
        content: `## Current Page\nTab: ${tabId}\nURL: ${pageState.url}\nTitle: ${pageState.title}\n\nThis is the active tab the user is viewing. The user may have switched tabs since your last turn.`,
      });
    }

    return sections;
  }

  async buildSnapshotSection(): Promise<PromptSection | null> {
    try {
      const snapshot = await this.browserManager.getSnapshot();
      return {
        id: "browser:snapshot",
        priority: 21,
        content: `### Page Snapshot (Accessibility Tree)\n\`\`\`\n${snapshot.text}\n\`\`\`\n\nUse the @ref IDs above to interact with page elements.`,
      };
    } catch {
      return null;
    }
  }

  isReady(): boolean {
    return this.browserManager.isReady();
  }

  waitUntilReady(timeoutMs?: number): Promise<void> {
    return this.browserManager.waitUntilReady(timeoutMs);
  }

  cleanup(): void {
    this.browserManager.cleanup();
  }

  /** Direct access for tool factories and IPC handlers that need BrowserManager. */
  getBrowserManager(): BrowserManager {
    return this.browserManager;
  }
}
