import type { ToolHandler } from "../../../../main/agent/tool-executor";
import type { BrowserManager } from "../../../../main/browser/browser-manager";
import { BROWSER_CLOSE_TAB } from "../../../../shared/tool-schemas";

export function executeBrowserCloseTab(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_CLOSE_TAB,
    async execute(args) {
      const tabId = args.tabId as string;
      if (!tabId) return { success: false, result: "", error: "tabId is required" };

      if (browser.tabCount <= 1) {
        return { success: false, result: "", error: "Cannot close the last tab" };
      }

      browser.closeTab(tabId);
      return { success: true, result: `Tab ${tabId} closed. Active tab is now ${browser.getActiveSession()?.tabId}.` };
    },
  };
}
