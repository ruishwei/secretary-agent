import { BROWSER_CLICK } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";

export function executeBrowserClick(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_CLICK,
    async execute(args) {
      const ref = args.ref as string;
      if (!ref) return { success: false, result: "", error: "ref is required (e.g., '@e5')" };
      if (!ref.startsWith("@e")) return { success: false, result: "", error: `Invalid ref format: ${ref}. Expected '@eN'` };

      const snapshot = await browser.clickByRef(ref);
      return {
        success: true,
        result: `Clicked ${ref}. Page updated.`,
        snapshot: snapshot.text,
      };
    },
  };
}
