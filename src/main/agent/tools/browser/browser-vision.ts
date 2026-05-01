import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";
import type { LLMClient } from "../../llm-client";
import { BROWSER_VISION } from "../../../../shared/tool-schemas";

export function executeBrowserVision(browser: BrowserManager, llm: LLMClient): ToolHandler {
  return {
    definition: BROWSER_VISION,
    async execute(args, onProgress) {
      const question = args.question as string;
      const tabId = args.tabId as string | undefined;

      onProgress?.({ type: "thinking", content: "Capturing screenshot..." });
      const screenshot = await browser.screenshot(tabId);
      onProgress?.({ type: "thinking", content: "Analyzing with vision model..." });

      let answer = "";
      for await (const delta of llm.streamingVisionQuery(screenshot, question)) {
        onProgress?.(delta);
        if (delta.type === "text") {
          answer += delta.content;
        }
      }

      return {
        success: true,
        result: answer || "No vision response",
      };
    },
  };
}
