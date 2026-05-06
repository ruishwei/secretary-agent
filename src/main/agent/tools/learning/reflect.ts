import type { ToolHandler } from "../../tool-executor";
import { REFLECT } from "../../../../shared/tool-schemas";
import type { SelfEvolution } from "../../../learning/self-evolution";
import type { MemoryStore } from "../../../memory/memory-store";
import type { SkillManager } from "../../../skills/skill-manager";

export function executeReflect(
  selfEvolution: SelfEvolution,
  memoryStore: MemoryStore,
  skillManager: SkillManager,
): ToolHandler {
  return {
    definition: REFLECT,
    async execute(args) {
      const focus = args.focus as string | undefined;
      const apply = args.apply !== false;

      const result = await selfEvolution.reflect("user-request");

      let response = `## Self-Reflection\n\n**Summary**: ${result.summary}\n\n`;

      if (result.insights.length > 0) {
        response += `### Insights\n${result.insights.map((i) => `- ${i}`).join("\n")}\n\n`;
      }

      if (result.skillUpdates.length > 0) {
        response += `### Skill Updates\n${result.skillUpdates
          .map((s) => `- ${s.action.toUpperCase()}: \`${s.name}\` — ${s.summary}`)
          .join("\n")}\n\n`;
      }

      if (result.memoryUpdates.length > 0) {
        response += `### Memory Updates\n${result.memoryUpdates
          .map((m) => `- ${m.action.toUpperCase()}: \`${m.key}\` — ${m.summary}`)
          .join("\n")}\n\n`;
      }

      if (result.insights.length === 0 && result.skillUpdates.length === 0 && result.memoryUpdates.length === 0) {
        response += `No specific improvements identified at this time.\n\n`;
      }

      response += `**Confidence**: ${(result.confidence * 100).toFixed(0)}%\n`;

      // Apply if requested
      if (apply) {
        const { applied, errors } = await selfEvolution.applyReflection(result);

        if (applied > 0) {
          response += `\n### Applied\n${applied} improvement(s) applied.`;
          // Refresh skill manager index
          await skillManager.initialize();
        }

        if (errors.length > 0) {
          response += `\n### Errors\n${errors.map((e) => `- ${e}`).join("\n")}`;
        }
      } else {
        response += `\n(Apply=false — improvements not applied. Set apply=true to auto-apply.)`;
      }

      // Store reflection notes in shallow memory for future reference
      if (result.insights.length > 0) {
        const insightsSummary = result.insights.join("; ");
        memoryStore.add("shallow", `Reflection insights: ${insightsSummary}`);
      }

      return { success: true, result: response };
    },
  };
}
