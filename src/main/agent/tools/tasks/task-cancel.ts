import type { ToolHandler } from "../../tool-executor";
import { TASK_CANCEL } from "../../../../shared/tool-schemas";
import type { TaskScheduler } from "../../../task/task-scheduler";

export function executeTaskCancel(scheduler: TaskScheduler): ToolHandler {
  return {
    definition: TASK_CANCEL,
    async execute(args) {
      const taskId = args.taskId as string;
      const reason = args.reason as string | undefined;

      const task = scheduler.getTask(taskId);
      if (!task) {
        return { success: false, result: `Task "${taskId}" not found.` };
      }
      if (task.status === "active") {
        return { success: false, result: `Cannot cancel active task "${taskId}". Use abort to stop the current task.` };
      }

      scheduler.cancelTask(taskId);
      return {
        success: true,
        result: `Cancelled task "${task.title}"${reason ? ` (${reason})` : ""}.`,
      };
    },
  };
}
