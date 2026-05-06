import type { ToolExecutor } from "../../tool-executor";
import type { TaskScheduler } from "../../../task/task-scheduler";
import { Logger } from "../../../utils/logger";
import { executeTaskCancel } from "./task-cancel";
import { executeTaskSetRelation } from "./task-set-relation";

const logger = new Logger("TaskTools");

export function registerTaskTools(executor: ToolExecutor, scheduler: TaskScheduler): void {
  const tools = [executeTaskCancel(scheduler), executeTaskSetRelation(scheduler)];

  for (const tool of tools) {
    executor.register(tool);
  }

  logger.info(`Registered ${tools.length} task tools`);
}
