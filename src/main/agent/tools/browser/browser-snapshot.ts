import { BROWSER_SNAPSHOT } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";

export function executeBrowserSnapshot(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_SNAPSHOT,
    async execute(args) {
      const full = args.full === true;
      const snapshot = await browser.getSnapshot(full);
      const elementCount = snapshot.nodes.size;
      return {
        success: true,
        result: `Page snapshot captured. ${elementCount} interactive elements found.`,
        snapshot: snapshot.text,
      };
    },
  };
}
