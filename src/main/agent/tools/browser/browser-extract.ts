import type { ToolHandler } from "../../tool-executor";
import type { BrowserManager } from "../../../browser/browser-manager";
import type { LLMClient } from "../../llm-client";
import { BROWSER_EXTRACT } from "../../../../shared/tool-schemas";

export function executeBrowserExtract(browser: BrowserManager, llm: LLMClient): ToolHandler {
  return {
    definition: BROWSER_EXTRACT,
    async execute(args) {
      const what = args.what as string;
      const snapshot = await browser.getSnapshot(true);

      const systemPrompt = `You are a precise data extraction tool. Extract the requested information from the page content provided. Return ONLY valid JSON — no markdown, no explanation, no code fences. If the data is not found, return {"error": "not found"}. Use the exact format the user requests.`;

      const userMessage = `Page content (accessibility tree text representation):
${snapshot.text}

Extract this information: ${what}`;

      const answer = await llm.simpleQuery(systemPrompt, userMessage);
      return { success: true, result: answer, snapshot: snapshot.text };
    },
  };
}
