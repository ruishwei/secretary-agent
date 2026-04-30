import type { ToolHandler } from "../../tool-executor";
import { SESSION_SEARCH } from "../../../../shared/tool-schemas";
import type { MemoryStore } from "../../../memory/memory-store";

export function executeSessionSearch(memoryStore: MemoryStore): ToolHandler {
  return {
    definition: SESSION_SEARCH,
    async execute(args) {
      const query = args.query as string;
      const maxResults = (args.maxResults as number) || 5;

      if (!query) {
        return { success: false, result: "", error: "query is required" };
      }

      const results = memoryStore.searchSessions(query, maxResults);

      if (results.length === 0) {
        return { success: true, result: `No past conversations found matching "${query}".` };
      }

      const lines = [`Past sessions matching "${query}":`];
      for (const r of results) {
        lines.push(`\n[${r.timestamp}]\n${r.snippet}`);
      }

      return { success: true, result: lines.join("\n") };
    },
  };
}
