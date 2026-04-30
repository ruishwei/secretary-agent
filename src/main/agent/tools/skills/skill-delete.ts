import type { ToolHandler } from "../../tool-executor";
import { SKILL_DELETE } from "../../../../shared/tool-schemas";
import type { SkillManager } from "../../../skills/skill-manager";

export function executeSkillDelete(skillManager: SkillManager): ToolHandler {
  return {
    definition: SKILL_DELETE,
    async execute(args) {
      const name = args.name as string;

      if (!name) {
        return { success: false, result: "", error: "name is required" };
      }

      const result = skillManager.delete(name);
      if (!result.success) {
        return { success: false, result: "", error: result.error };
      }

      return {
        success: true,
        result: `Skill '${name}' deleted.`,
      };
    },
  };
}
