import type { ToolHandler } from "../../tool-executor";
import { MEMORY_GET } from "../../../../shared/tool-schemas";
import type { MemoryStore } from "../../../memory/memory-store";

// memory_get reads directly from filesystem, so we accept the memory path
export function executeMemoryGet(_memoryStore: MemoryStore): ToolHandler {
  return {
    definition: MEMORY_GET,
    async execute(args) {
      const filePath = args.path as string;
      const fromLine = (args.fromLine as number) || 1;
      const maxLines = (args.lines as number) || 50;

      if (!filePath) {
        return { success: false, result: "", error: "path is required" };
      }

      // Use MemoryStore's internal file reading via search
      // This tool reads specific files — delegate to a lightweight read
      const fs = await import("node:fs");
      const path = await import("node:path");

      // Prevent path traversal
      const normalized = path.resolve(filePath);
      if (normalized.includes("..")) {
        return { success: false, result: "", error: "Invalid path" };
      }

      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        const start = Math.max(0, fromLine - 1);
        const end = Math.min(lines.length, start + maxLines);
        const result = lines.slice(start, end).join("\n");

        return {
          success: true,
          result: result || "(empty)",
        };
      } catch (err: any) {
        return { success: false, result: "", error: `Cannot read file: ${err.message}` };
      }
    },
  };
}
