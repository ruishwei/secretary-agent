import type { ToolExecutor } from "../../tool-executor";
import type { SkillManager } from "../../../skills/skill-manager";
import { Logger } from "../../../utils/logger";
import { executeSkillList } from "./skill-list";
import { executeSkillView } from "./skill-view";
import { executeSkillCreate } from "./skill-create";
import { executeSkillPatch } from "./skill-patch";
import { executeSkillDelete } from "./skill-delete";

const logger = new Logger("SkillTools");

export function registerSkillTools(executor: ToolExecutor, skillManager: SkillManager): void {
  const tools = [
    executeSkillList(skillManager),
    executeSkillView(skillManager),
    executeSkillCreate(skillManager),
    executeSkillPatch(skillManager),
    executeSkillDelete(skillManager),
  ];

  for (const tool of tools) {
    executor.register(tool);
  }

  logger.info(`Registered ${tools.length} skill tools`);
}
