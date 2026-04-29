import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";
import { BROWSER_NEW_TAB } from "../../../../shared/tool-schemas";

export function executeBrowserNewTab(
  browser: BrowserManager,
  onTabCreated?: (tabId: string, url?: string) => void
): ToolHandler {
  return {
    definition: BROWSER_NEW_TAB,
    async execute(args) {
      const url = args.url as string | undefined;
      const tabId = `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      browser.createTab(tabId);
      if (onTabCreated) {
        onTabCreated(tabId, url);
      }
      return {
        success: true,
        result: `New tab created: ${tabId}${url ? ` (will navigate to ${url})` : ""}.`,
      };
    },
  };
}
