import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";
import type { LLMClient } from "../../llm-client";
import { BROWSER_VISION } from "../../../../shared/tool-schemas";

export function executeBrowserVision(browser: BrowserManager, llm: LLMClient): ToolHandler {
  return {
    definition: BROWSER_VISION,
    async execute(args) {
      const question = args.question as string;
      const screenshot = await browser.screenshot();
      const answer = await llm.visionQuery(screenshot, question);
      return {
        success: true,
        result: answer,
      };
    },
  };
}
