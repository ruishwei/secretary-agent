import { BROWSER_PRESS } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";

export function executeBrowserPress(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_PRESS,
    async execute(args) {
      const key = args.key as string;
      if (!key) return { success: false, result: "", error: "key is required" };

      await browser.pressKey(key);
      const snapshot = await browser.getSnapshot();
      return {
        success: true,
        result: `Pressed ${key}.`,
        snapshot: snapshot.text,
      };
    },
  };
}
