import type { MemoryStore } from "../memory/memory-store";
import type { SkillManager } from "../skills/skill-manager";
import type { LLMClient } from "../agent/llm-client";

export interface ReflectionResult {
  date: string;
  summary: string;
  insights: string[];
  skillUpdates: { name: string; action: "create" | "update" | "delete"; summary: string }[];
  memoryUpdates: { action: "add" | "remove" | "promote"; key: string; summary: string }[];
  confidence: number; // 0-1 how confident the agent is in these insights
}

export interface EvolutionEntry {
  timestamp: number;
  trigger: "scheduled" | "idle" | "user-request" | "task-complete";
  result: ReflectionResult;
}

export class SelfEvolution {
  private history: EvolutionEntry[] = [];
  private skillManager: SkillManager | null = null;
  private memoryStore: MemoryStore | null = null;
  private llmClient: LLMClient | null = null;

  // Auto-reflection scheduling
  private lastReflectionTime = 0;
  private tasksSinceLastReflection = 0;
  private readonly REFLECTION_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
  private readonly TASK_THRESHOLD = 5; // or after 5 completed tasks
  private reflecting = false;

  setSkillManager(sm: SkillManager): void {
    this.skillManager = sm;
  }

  setMemoryStore(ms: MemoryStore): void {
    this.memoryStore = ms;
  }

  setLLMClient(llm: LLMClient): void {
    this.llmClient = llm;
  }

  getHistory(): EvolutionEntry[] {
    return this.history;
  }

  /** Call after each task completes. Triggers reflection if threshold reached. */
  onTaskCompleted(): void {
    this.tasksSinceLastReflection++;
  }

  /** Check if auto-reflection is due and not already in progress. */
  shouldAutoReflect(): boolean {
    if (this.reflecting) return false;
    if (!this.llmClient) return false;

    const timeSinceLast = Date.now() - this.lastReflectionTime;
    const timeTrigger = timeSinceLast >= this.REFLECTION_INTERVAL_MS;
    const taskTrigger = this.tasksSinceLastReflection >= this.TASK_THRESHOLD;

    return timeTrigger && taskTrigger;
  }

  /** Trigger auto-reflection if conditions met. Returns result or null if skipped. */
  async autoReflect(): Promise<ReflectionResult | null> {
    if (!this.shouldAutoReflect()) return null;

    this.reflecting = true;
    try {
      const result = await this.reflect("scheduled");
      this.lastReflectionTime = Date.now();
      this.tasksSinceLastReflection = 0;

      // Apply high-confidence results automatically
      if (result.confidence >= 0.7) {
        await this.applyReflection(result);
      }
      return result;
    } finally {
      this.reflecting = false;
    }
  }

  async reflect(trigger: EvolutionEntry["trigger"]): Promise<ReflectionResult> {
    if (!this.llmClient) {
      return {
        date: new Date().toISOString(),
        summary: "Reflection skipped: no LLM client available.",
        insights: [],
        skillUpdates: [],
        memoryUpdates: [],
        confidence: 0,
      };
    }

    const entry: EvolutionEntry = {
      timestamp: Date.now(),
      trigger,
      result: { date: "", summary: "", insights: [], skillUpdates: [], memoryUpdates: [], confidence: 0 },
    };

    try {
      entry.result = await this.runReflection();
    } catch (err: any) {
      entry.result = {
        date: new Date().toISOString(),
        summary: `Reflection failed: ${err.message}`,
        insights: [],
        skillUpdates: [],
        memoryUpdates: [],
        confidence: 0,
      };
    }

    this.history.push(entry);
    // Keep last 30 entries
    if (this.history.length > 30) {
      this.history = this.history.slice(-30);
    }

    // Persist reflection to memory
    if (this.memoryStore && entry.result.insights.length > 0) {
      const insightsText = entry.result.insights.join("\n");
      this.memoryStore.add("deep", `[Reflection ${entry.result.date}]: ${insightsText}`);
    }

    return entry.result;
  }

  private async runReflection(): Promise<ReflectionResult> {
    const memorySnapshot = this.memoryStore?.getMemorySnapshot() || "";
    const shallowMemory = this.memoryStore?.getRecentShallow(7, 3000) || "";
    const skillsIndex = this.skillManager?.getSkillsIndex() || "";

    const reflectionPrompt = `You are the self-reflection module of an AI agent. Your task is to analyze recent activity and identify concrete improvements.

## Recent Memory (last 7 days)
${shallowMemory || "(No recent shallow memory)"}

## Core Knowledge
${memorySnapshot.slice(0, 3000) || "(No deep memory)"}

## Available Skills
${skillsIndex || "(No skills loaded)"}

## Instructions
Analyze the above and produce a structured reflection. Focus on:
1. What patterns do you see in recent activity?
2. What worked well that should be reinforced?
3. What failed or was inefficient?
4. What new skills or knowledge would improve future performance?
5. Are there any contradictions or outdated information in core knowledge?

Respond with a JSON object (no markdown, no code fences):
{
  "summary": "One-sentence summary of the reflection",
  "insights": ["insight 1", "insight 2", ...],
  "skillUpdates": [
    { "name": "skill-name", "action": "create|update|delete", "summary": "why" }
  ],
  "memoryUpdates": [
    { "action": "add|remove|promote", "key": "memory key", "summary": "why" }
  ],
  "confidence": 0.8
}`;

    if (!this.llmClient) {
      return {
        date: new Date().toISOString().slice(0, 10),
        summary: "Reflection skipped: LLM client not available.",
        insights: [],
        skillUpdates: [],
        memoryUpdates: [],
        confidence: 0,
      };
    }

    const response = await this.llmClient.simpleQuery(
      "You are an AI self-reflection engine. Output only valid JSON, no explanation.",
      reflectionPrompt,
    );

    // Parse the JSON response
    try {
      // Strip possible markdown fences
      const jsonStr = response
        .replace(/```json\s*/gi, "")
        .replace(/```\s*/g, "")
        .trim();
      const parsed = JSON.parse(jsonStr);
      return {
        date: new Date().toISOString().slice(0, 10),
        summary: parsed.summary || "Reflection complete.",
        insights: parsed.insights || [],
        skillUpdates: parsed.skillUpdates || [],
        memoryUpdates: parsed.memoryUpdates || [],
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.7,
      };
    } catch {
      return {
        date: new Date().toISOString().slice(0, 10),
        summary: "Reflection produced unstructured output.",
        insights: [response.slice(0, 500)],
        skillUpdates: [],
        memoryUpdates: [],
        confidence: 0.3,
      };
    }
  }

  async applyReflection(result: ReflectionResult): Promise<{ applied: number; errors: string[] }> {
    const errors: string[] = [];
    let applied = 0;

    // Apply skill updates
    if (this.skillManager) {
      for (const su of result.skillUpdates) {
        try {
          switch (su.action) {
            case "create":
              await this.skillManager.create("agent-generated", su.name, `# ${su.name}\n\n${su.summary}\n\nAuto-generated by self-evolution.`);
              applied++;
              break;
            case "update": {
              const existing = await this.skillManager.load(su.name);
              if (existing) {
                const appendText = `\n\n## Evolution Update\n\n${su.summary}`;
                const result = this.skillManager.patch(su.name, "## Evolution Update", appendText);
                if (result.success) applied++;
              }
              break;
            }
            case "delete":
              await this.skillManager.delete(su.name);
              applied++;
              break;
          }
        } catch (err: any) {
          errors.push(`Skill "${su.name}" ${su.action}: ${err.message}`);
        }
      }
    }

    // Apply memory updates
    if (this.memoryStore) {
      for (const mu of result.memoryUpdates) {
        try {
          switch (mu.action) {
            case "add":
              this.memoryStore.add("deep", `${mu.key}: ${mu.summary}`);
              applied++;
              break;
            case "remove":
              // MemoryStore doesn't have direct remove-by-key, use replace
              this.memoryStore.add("shallow", `[DEPRECATED] ${mu.key}: ${mu.summary}`);
              applied++;
              break;
            case "promote":
              this.memoryStore.promoteIfEligible(mu.key);
              applied++;
              break;
          }
        } catch (err: any) {
          errors.push(`Memory "${mu.key}" ${mu.action}: ${err.message}`);
        }
      }
    }

    return { applied, errors };
  }
}
