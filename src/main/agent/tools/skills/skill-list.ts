import type { ToolHandler } from "../../tool-executor";
import { SKILL_LIST } from "../../../../shared/tool-schemas";
import type { SkillManager } from "../../../skills/skill-manager";

export function executeSkillList(skillManager: SkillManager): ToolHandler {
  return {
    definition: SKILL_LIST,
    async execute(args) {
      const category = args.category as string | undefined;
      const skills = skillManager.list(category || undefined);

      if (skills.length === 0) {
        return {
          success: true,
          result: "No skills available" + (category ? ` in category '${category}'` : "") + ".",
        };
      }

      const byCategory = new Map<string, typeof skills>();
      for (const skill of skills) {
        const list = byCategory.get(skill.category) || [];
        list.push(skill);
        byCategory.set(skill.category, list);
      }

      const lines: string[] = [];
      for (const [cat, items] of byCategory) {
        lines.push(`## ${cat}`);
        for (const item of items) {
          lines.push(`- **${item.name}** (v${item.version}): ${item.description}`);
        }
      }

      return { success: true, result: lines.join("\n") };
    },
  };
}
