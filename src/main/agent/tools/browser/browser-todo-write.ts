import type { ToolHandler } from "../../tool-executor";
import { BROWSER_TODO_WRITE } from "../../../../shared/tool-schemas";

export interface PlanItem {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed";
}

export function executeBrowserTodoWrite(): ToolHandler {
  return {
    definition: BROWSER_TODO_WRITE,
    async execute(args) {
      const items = args.items as PlanItem[];
      if (!items || !Array.isArray(items)) {
        return { success: false, result: "", error: "items array is required" };
      }

      const pending = items.filter((i) => i.status === "pending").length;
      const completed = items.filter((i) => i.status === "completed").length;
      const inProgress = items.filter((i) => i.status === "in_progress").length;

      return {
        success: true,
        result: JSON.stringify({
          message: `Plan updated: ${completed} done, ${inProgress} in progress, ${pending} pending`,
          items,
        }),
        // Pass plan items through for the renderer to consume
        snapshot: undefined,
      };
    },
  };
}
