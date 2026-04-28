import { BROWSER_BACK } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";

export function executeBrowserBack(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_BACK,
    async execute(_args) {
      const snapshot = await browser.back();
      return {
        success: true,
        result: "Navigated back.",
        snapshot: snapshot.text,
      };
    },
  };
}
