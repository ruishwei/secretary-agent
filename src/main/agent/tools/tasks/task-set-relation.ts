import type { ToolHandler } from "../../tool-executor";
import { TASK_SET_RELATION } from "../../../../shared/tool-schemas";
import type { TaskScheduler } from "../../../task/task-scheduler";
import type { TaskRelation } from "../../../../shared/types";

export function executeTaskSetRelation(scheduler: TaskScheduler): ToolHandler {
  return {
    definition: TASK_SET_RELATION,
    async execute(args) {
      const taskId = args.taskId as string;
      const type = args.type as TaskRelation;
      const targetTaskId = args.targetTaskId as string;

      const task = scheduler.getTask(taskId);
      if (!task) {
        return { success: false, result: `Task "${taskId}" not found.` };
      }
      const target = scheduler.getTask(targetTaskId);
      if (!target) {
        return { success: false, result: `Target task "${targetTaskId}" not found.` };
      }

      scheduler.setRelation(taskId, { type, taskId: targetTaskId });

      const verb = type === "supersedes" ? "supersedes" : type === "depends-on" ? "depends on" : "continues";
      return {
        success: true,
        result: `Task "${task.title}" now ${verb} "${target.title}".`,
      };
    },
  };
}
