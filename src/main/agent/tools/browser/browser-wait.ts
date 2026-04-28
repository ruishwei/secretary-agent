import { BROWSER_WAIT } from "../../../../shared/tool-schemas";
import type { ToolHandler } from "../../tool-executor";
import { DEFAULT_WAIT_TIMEOUT_MS } from "../../../../shared/constants";

export function executeBrowserWait(_browser: any): ToolHandler {
  return {
    definition: BROWSER_WAIT,
    async execute(args) {
      const timeoutMs = (args.timeoutMs as number) || DEFAULT_WAIT_TIMEOUT_MS;
      const text = args.text as string | undefined;

      if (text) {
        // Simple polling wait for text
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
          const snapshot = await _browser.getSnapshot();
          if (snapshot.text.includes(text)) {
            return {
              success: true,
              result: `Found "${text}" on page after ${Date.now() - start}ms.`,
              snapshot: snapshot.text,
            };
          }
          await new Promise((r) => setTimeout(r, 500));
        }
        return {
          success: false,
          result: "",
          error: `Timed out waiting for "${text}" after ${timeoutMs}ms.`,
        };
      }

      await new Promise((r) => setTimeout(r, timeoutMs));
      const snapshot = await _browser.getSnapshot();
      return {
        success: true,
        result: `Waited ${timeoutMs}ms.`,
        snapshot: snapshot.text,
      };
    },
  };
}
