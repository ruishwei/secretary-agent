import { BROWSER_TYPE } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";

export function executeBrowserType(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_TYPE,
    async execute(args) {
      const ref = args.ref as string;
      const text = args.text as string;
      const tabId = args.tabId as string | undefined;
      if (!ref) return { success: false, result: "", error: "ref is required" };
      if (!text && text !== "") return { success: false, result: "", error: "text is required" };

      const snapshot = await browser.typeByRef(ref, text, tabId);
      return {
        success: true,
        result: `Typed "${text}" into ${ref}.`,
        snapshot: snapshot.text,
      };
    },
  };
}
