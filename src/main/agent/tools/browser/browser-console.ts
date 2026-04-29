import { BROWSER_CONSOLE } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";

export function executeBrowserConsole(browser: BrowserManager): ToolHandler {
  return {
    definition: BROWSER_CONSOLE,
    async execute(args) {
      const expression = args.expression as string | undefined;
      const tabId = args.tabId as string | undefined;

      if (expression) {
        const result = await browser.evaluateJs(expression, tabId);
        return { success: true, result: `Eval result: ${result}` };
      }

      const messages = browser.getConsoleMessages(tabId);
      if (messages.length === 0) {
        return { success: true, result: "No console messages captured." };
      }
      return {
        success: true,
        result: `Console messages (last ${Math.min(messages.length, 20)}):\n${messages.slice(-20).join("\n")}`,
      };
    },
  };
}
