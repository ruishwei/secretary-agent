import { BROWSER_NAVIGATE } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";

export function executeBrowserNavigate(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_NAVIGATE,
    async execute(args) {
      const url = args.url as string;
      if (!url) return { success: false, result: "", error: "url is required" };

      const { pageState, snapshot } = await browser.navigate(url);
      return {
        success: true,
        result: `Navigated to ${pageState.url}. Title: ${pageState.title}`,
        snapshot: snapshot.text,
      };
    },
  };
}
