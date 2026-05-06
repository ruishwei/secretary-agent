import { BROWSER_SCROLL } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../../../main/agent/tool-executor";
import type { BrowserManager } from "../../../../main/browser/browser-manager";

export function executeBrowserScroll(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_SCROLL,
    async execute(args) {
      const direction = (args.direction as string) || "down";
      const amount = args.amount as number | undefined;
      const tabId = args.tabId as string | undefined;
      await browser.scroll(direction as "up" | "down", amount, tabId);
      const snapshot = await browser.getSnapshot(false, tabId);
      return {
        success: true,
        result: `Scrolled ${direction}${amount ? ` ${amount}px` : ""}.`,
        snapshot: snapshot.text,
      };
    },
  };
}
