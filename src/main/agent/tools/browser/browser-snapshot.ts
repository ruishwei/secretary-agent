import { BROWSER_SNAPSHOT } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";

export function executeBrowserSnapshot(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_SNAPSHOT,
    async execute(args) {
      const full = args.full === true;
      const tabId = args.tabId as string | undefined;
      const includeRefs = args.includeRefs !== false; // default true
      const snapshot = await browser.getSnapshot(full, tabId, includeRefs);
      const elementCount = snapshot.nodes.size;
      return {
        success: true,
        result: `Page snapshot (${elementCount} elements):\n${snapshot.text}`,
        snapshot: snapshot.text,
      };
    },
  };
}
