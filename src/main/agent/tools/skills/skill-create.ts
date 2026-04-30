import type { ToolHandler } from "../../tool-executor";
import { SKILL_CREATE } from "../../../../shared/tool-schemas";
import type { SkillManager } from "../../../skills/skill-manager";

export function executeSkillCreate(skillManager: SkillManager): ToolHandler {
  return {
    definition: SKILL_CREATE,
    async execute(args) {
      const name = args.name as string;
      const category = args.category as string;
      const content = args.content as string;

      if (!name || !category || !content) {
        return { success: false, result: "", error: "name, category, and content are required" };
      }

      const result = skillManager.create(category, name, content);
      if (!result.success) {
        return { success: false, result: "", error: result.error };
      }

      return {
        success: true,
        result: `Skill '${name}' created in category '${category}'. It is now available for future sessions.`,
      };
    },
  };
}
