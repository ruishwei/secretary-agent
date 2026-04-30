import type { ToolHandler } from "../../tool-executor";
import { MEMORY_ADD } from "../../../../shared/tool-schemas";
import type { MemoryStore } from "../../../memory/memory-store";

export function executeMemoryAdd(memoryStore: MemoryStore): ToolHandler {
  return {
    definition: MEMORY_ADD,
    async execute(args) {
      const target = args.target as "memory" | "user";
      const entry = args.entry as string;

      if (!target || !entry) {
        return { success: false, result: "", error: "target (memory|user) and entry are required" };
      }

      if (target !== "memory" && target !== "user") {
        return { success: false, result: "", error: "target must be 'memory' or 'user'" };
      }

      const result = memoryStore.add(target, entry);
      if (!result.success) {
        return { success: false, result: "", error: result.error };
      }

      const label = target === "memory" ? "MEMORY.md" : "USER.md";
      return { success: true, result: `Entry added to ${label}.` };
    },
  };
}
