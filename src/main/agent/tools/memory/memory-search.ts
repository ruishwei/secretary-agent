import type { ToolHandler } from "../../tool-executor";
import { MEMORY_SEARCH } from "../../../../shared/tool-schemas";
import type { MemoryStore } from "../../../memory/memory-store";

export function executeMemorySearch(memoryStore: MemoryStore): ToolHandler {
  return {
    definition: MEMORY_SEARCH,
    async execute(args) {
      const query = args.query as string;
      const maxResults = (args.maxResults as number) || 5;
      const minScore = (args.minScore as number) || 0.3;

      if (!query) {
        return { success: false, result: "", error: "query is required" };
      }

      const results = memoryStore.search(query, maxResults, minScore);

      if (results.length === 0) {
        return { success: true, result: `No memories found matching "${query}".` };
      }

      const lines = [`Search results for "${query}":`];
      for (const r of results) {
        const scorePct = Math.round(r.score * 100);
        lines.push(`\n[${r.path}] (relevance: ${scorePct}%)\n${r.snippet}`);
      }

      return { success: true, result: lines.join("\n") };
    },
  };
}
