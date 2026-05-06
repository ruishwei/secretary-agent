import type { ToolHandler } from "../../tool-executor";
import { MEMORY_ADD } from "../../../../shared/tool-schemas";
import type { MemoryStore } from "../../../memory/memory-store";

export function executeMemoryAdd(memoryStore: MemoryStore): ToolHandler {
  return {
    definition: MEMORY_ADD,
    async execute(args) {
      const target = args.target as "shallow" | "deep" | "user";
      const entry = args.entry as string;

      if (!target || !entry) {
        return { success: false, result: "", error: "target (shallow|deep|user) and entry are required" };
      }

      if (target !== "shallow" && target !== "deep" && target !== "user") {
        return { success: false, result: "", error: "target must be 'shallow', 'deep', or 'user'" };
      }

      const result = memoryStore.add(target, entry);
      if (!result.success) {
        return { success: false, result: "", error: result.error };
      }

      if (result.deduped) {
        const labels: Record<string, string> = { shallow: "shallow memory", deep: "deep memory", user: "user profile" };
        return { success: true, result: `Similar entry already exists in ${labels[target]}. Skipped (deduplicated).` };
      }

      const labels: Record<string, string> = { shallow: "shallow memory (auto-forgets in 7 days)", deep: "deep memory (persistent)", user: "user profile" };
      return { success: true, result: `Entry added to ${labels[target]}.` };
    },
  };
}
