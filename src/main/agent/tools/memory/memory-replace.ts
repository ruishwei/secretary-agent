import type { ToolHandler } from "../../tool-executor";
import { MEMORY_REPLACE } from "../../../../shared/tool-schemas";
import type { MemoryStore } from "../../../memory/memory-store";

export function executeMemoryReplace(memoryStore: MemoryStore): ToolHandler {
  return {
    definition: MEMORY_REPLACE,
    async execute(args) {
      const target = args.target as "memory" | "user";
      const oldStr = args.old as string;
      const newStr = args.new as string;

      if (!target || !oldStr || !newStr) {
        return { success: false, result: "", error: "target, old, and new are required" };
      }

      if (target !== "memory" && target !== "user") {
        return { success: false, result: "", error: "target must be 'memory' or 'user'" };
      }

      const result = memoryStore.replace(target, oldStr, newStr);
      if (!result.success) {
        return { success: false, result: "", error: result.error };
      }

      const label = target === "memory" ? "MEMORY.md" : "USER.md";
      return { success: true, result: `Entry replaced in ${label}.` };
    },
  };
}
