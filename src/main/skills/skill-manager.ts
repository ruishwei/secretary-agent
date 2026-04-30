import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { Logger } from "../utils/logger";

const logger = new Logger("SkillMgr");

export interface SkillMeta {
  name: string;
  category: string;
  description: string;
  version: string;
  path: string;
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
  version?: string;
}

export class SkillManager {
  private skills = new Map<string, SkillMeta>();
  private userSkillsPath: string;
  private bundledSkillsPath: string;

  constructor(userSkillsPath: string) {
    this.userSkillsPath = userSkillsPath;
    this.bundledSkillsPath = path.join(app.getAppPath(), "resources", "skills");
  }

  async initialize(): Promise<void> {
    this.skills.clear();

    // Scan bundled skills first (lower priority)
    await this.scanDirectory(this.bundledSkillsPath);

    // Scan user skills (higher priority — overwrites bundled)
    await this.scanDirectory(this.userSkillsPath);

    logger.info(`Loaded ${this.skills.size} skills`);
  }

  private async scanDirectory(basePath: string): Promise<void> {
    if (!fs.existsSync(basePath)) return;

    const entries = fs.readdirSync(basePath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const categoryPath = path.join(basePath, entry.name);
      const skillDirs = fs.readdirSync(categoryPath, { withFileTypes: true });
      for (const skillDir of skillDirs) {
        if (!skillDir.isDirectory()) continue;
        const skillPath = path.join(categoryPath, skillDir.name);
        const skillMdPath = path.join(skillPath, "SKILL.md");
        if (!fs.existsSync(skillMdPath)) continue;

        try {
          const meta = this.parseSkill(skillMdPath, entry.name, skillPath);
          if (meta) {
            this.skills.set(meta.name, meta);
          }
        } catch (err) {
          logger.warn(`Failed to parse skill at ${skillMdPath}: ${err}`);
        }
      }
    }
  }

  private parseSkill(filePath: string, category: string, skillPath: string): SkillMeta | null {
    const content = fs.readFileSync(filePath, "utf-8");
    const frontmatter = this.parseFrontmatter(content);

    const name = frontmatter.name;
    if (!name) {
      logger.warn(`Skill at ${filePath} has no name in frontmatter`);
      return null;
    }

    return {
      name,
      category,
      description: frontmatter.description || "",
      version: frontmatter.version || "1.0.0",
      path: skillPath,
    };
  }

  private parseFrontmatter(content: string): SkillFrontmatter {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return {};

    const yaml = match[1];
    const result: SkillFrontmatter = {};

    const nameMatch = yaml.match(/^name:\s*(.+)$/m);
    if (nameMatch) result.name = nameMatch[1].trim();

    const descMatch = yaml.match(/^description:\s*(.+)$/m);
    if (descMatch) result.description = descMatch[1].trim();

    const verMatch = yaml.match(/^version:\s*(.+)$/m);
    if (verMatch) result.version = verMatch[1].trim();

    return result;
  }

  /** List all available skills, optionally filtered by category. */
  list(category?: string): SkillMeta[] {
    const all = [...this.skills.values()];
    if (category) {
      return all.filter((s) => s.category === category);
    }
    return all;
  }

  /** Load a skill's full SKILL.md content. Optionally load a specific file within the skill directory. */
  load(name: string, file?: string): string | null {
    const skill = this.skills.get(name);
    if (!skill) return null;

    const filePath = file ? path.join(skill.path, file) : path.join(skill.path, "SKILL.md");

    if (!fs.existsSync(filePath)) return null;
    // Ensure the path is within the skill directory (prevent path traversal)
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(skill.path))) return null;

    return fs.readFileSync(resolved, "utf-8");
  }

  /** Create a new skill in the user skills directory. */
  create(category: string, name: string, content: string): { success: boolean; error?: string } {
    // Validate name format
    if (!/^[a-z0-9._-]{1,64}$/.test(name)) {
      return { success: false, error: "Name must be 1-64 chars: lowercase letters, digits, dots, underscores, dashes" };
    }

    // Validate frontmatter exists
    if (!/^---[\s\S]*?---/.test(content)) {
      return { success: false, error: "SKILL.md must have YAML frontmatter (--- ... ---)" };
    }

    const skillDir = path.join(this.userSkillsPath, category, name);
    if (fs.existsSync(skillDir)) {
      return { success: false, error: `Skill '${name}' already exists in category '${category}'` };
    }

    try {
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), content, "utf-8");

      // Add to in-memory registry
      const frontmatter = this.parseFrontmatter(content);
      this.skills.set(name, {
        name,
        category,
        description: frontmatter.description || "",
        version: frontmatter.version || "1.0.0",
        path: skillDir,
      });

      logger.info(`Skill created: ${category}/${name}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Failed to create skill: ${err.message}` };
    }
  }

  /** Patch a skill by fuzzy-replacing text in its SKILL.md. */
  patch(name: string, oldStr: string, newStr: string): { success: boolean; error?: string } {
    const skill = this.skills.get(name);
    if (!skill) return { success: false, error: `Skill '${name}' not found` };

    const filePath = path.join(skill.path, "SKILL.md");
    if (!fs.existsSync(filePath)) return { success: false, error: "SKILL.md not found" };

    try {
      let content = fs.readFileSync(filePath, "utf-8");

      // Fuzzy match: normalize whitespace for comparison
      const normalized = content.replace(/\s+/g, " ");
      const oldNormalized = oldStr.replace(/\s+/g, " ");
      if (!normalized.includes(oldNormalized)) {
        return { success: false, error: "old_string not found in SKILL.md (fuzzy match failed)" };
      }

      // Replace in original content using the actual substring
      const idx = content.indexOf(oldStr);
      if (idx >= 0) {
        content = content.slice(0, idx) + newStr + content.slice(idx + oldStr.length);
      } else {
        // Fall back to regex with whitespace flexibility
        const escaped = oldStr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
        const regex = new RegExp(escaped);
        content = content.replace(regex, newStr);
      }

      fs.writeFileSync(filePath, content, "utf-8");
      logger.info(`Skill patched: ${name}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Failed to patch skill: ${err.message}` };
    }
  }

  /** Delete a skill. Only user skills can be deleted. */
  delete(name: string): { success: boolean; error?: string } {
    const skill = this.skills.get(name);
    if (!skill) return { success: false, error: `Skill '${name}' not found` };

    // Only allow deleting user skills
    if (!skill.path.startsWith(this.userSkillsPath)) {
      return { success: false, error: "Cannot delete bundled skills" };
    }

    try {
      fs.rmSync(skill.path, { recursive: true, force: true });
      this.skills.delete(name);
      logger.info(`Skill deleted: ${name}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: `Failed to delete skill: ${err.message}` };
    }
  }

  /** Get skills index for system prompt injection. */
  getSkillsIndex(): Array<{ name: string; category: string; description: string }> {
    return [...this.skills.values()].map((s) => ({
      name: s.name,
      category: s.category,
      description: s.description,
    }));
  }
}
