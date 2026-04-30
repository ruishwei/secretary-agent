import type { ToolHandler } from "../../tool-executor";
import { SKILL_PATCH } from "../../../../shared/tool-schemas";
import type { SkillManager } from "../../../skills/skill-manager";

export function executeSkillPatch(skillManager: SkillManager): ToolHandler {
  return {
    definition: SKILL_PATCH,
    async execute(args) {
      const name = args.name as string;
      const oldStr = args.old_string as string;
      const newStr = args.new_string as string;

      if (!name || !oldStr || !newStr) {
        return { success: false, result: "", error: "name, old_string, and new_string are required" };
      }

      const result = skillManager.patch(name, oldStr, newStr);
      if (!result.success) {
        return { success: false, result: "", error: result.error };
      }

      return {
        success: true,
        result: `Skill '${name}' patched successfully.`,
      };
    },
  };
}
