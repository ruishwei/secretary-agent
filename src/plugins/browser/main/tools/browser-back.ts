import { BROWSER_BACK } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../../../main/agent/tool-executor";
import type { BrowserManager } from "../../../../main/browser/browser-manager";

export function executeBrowserBack(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_BACK,
    async execute(args) {
      const tabId = args.tabId as string | undefined;
      const snapshot = await browser.back(tabId);
      return {
        success: true,
        result: "Navigated back.",
        snapshot: snapshot.text,
      };
    },
  };
}
