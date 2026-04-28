import { BROWSER_SCROLL } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";

export function executeBrowserScroll(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_SCROLL,
    async execute(args) {
      const direction = (args.direction as string) || "down";
      const amount = args.amount as number | undefined;
      await browser.scroll(direction as "up" | "down", amount);
      const snapshot = await browser.getSnapshot();
      return {
        success: true,
        result: `Scrolled ${direction}${amount ? ` ${amount}px` : ""}.`,
        snapshot: snapshot.text,
      };
    },
  };
}
