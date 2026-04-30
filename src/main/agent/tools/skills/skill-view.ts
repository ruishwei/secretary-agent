import type { ToolHandler } from "../../tool-executor";
import { SKILL_VIEW } from "../../../../shared/tool-schemas";
import type { SkillManager } from "../../../skills/skill-manager";

export function executeSkillView(skillManager: SkillManager): ToolHandler {
  return {
    definition: SKILL_VIEW,
    async execute(args) {
      const name = args.name as string;
      const file = args.file_path as string | undefined;

      const content = skillManager.load(name, file);
      if (content === null) {
        const target = file ? `file '${file}' in skill '${name}'` : `skill '${name}'`;
        return { success: false, result: "", error: `Could not load ${target}. Check skill_list for available skills.` };
      }

      return { success: true, result: content };
    },
  };
}
