import { BROWSER_SNAPSHOT } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../../../main/agent/tool-executor";
import type { BrowserManager } from "../../../../main/browser/browser-manager";

export function executeBrowserSnapshot(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_SNAPSHOT,
    async execute(args) {
      const full = args.full === true;
      const tabId = args.tabId as string | undefined;
      const includeRefs = args.includeRefs !== false;
      const snapshot = await browser.getSnapshot(full, tabId, includeRefs);

      return {
        success: true,
        result: `Page snapshot captured. ${snapshot.nodes.size} elements found.`,
        snapshot: snapshot.text,
      };
    },
  };
}
