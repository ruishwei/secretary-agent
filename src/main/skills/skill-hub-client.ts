import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import AdmZip from "adm-zip";
import { Logger } from "../utils/logger";

const logger = new Logger("SkillHub");

export interface HubSearchResult {
  slug: string;
  name: string;
  description: string;
  version?: string;
  category?: string;
  author?: string;
  downloads?: number;
}

export interface HubSkillDetail {
  slug: string;
  name: string;
  description: string;
  version?: string;
  category?: string;
  author?: string;
  downloads?: number;
  skillMdContent?: string;
  files?: Array<{ path: string; size: number }>;
}

// Actual API response shapes (from OpenAPI spec)
interface ApiSearchResult {
  score: number;
  slug: string | null;
  displayName: string | null;
  summary: string | null;
  version: string | null;
  updatedAt: number | null;
}

interface ApiSearchResponse {
  results: ApiSearchResult[];
}

interface ApiSkillResponse {
  skill: {
    slug: string;
    displayName: string;
    summary: string | null;
    tags: Record<string, string>;
    stats: Record<string, number>;
    createdAt: number;
    updatedAt: number;
  } | null;
  latestVersion: {
    version: string;
    createdAt: number;
    changelog: string;
  } | null;
  owner: {
    handle: string | null;
    displayName: string | null;
    image: string | null;
  } | null;
  moderation: unknown;
}

export class SkillHubClient {
  private baseUrl: string;

  constructor(baseUrl = "https://clawhub.ai/api/v1") {
    this.baseUrl = baseUrl;
  }

  async search(query: string, limit = 20, offset = 0): Promise<{ results: HubSearchResult[]; total?: number }> {
    const url = `${this.baseUrl}/search?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`;
    logger.info(`Searching ClawHub: "${query}"`);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`ClawHub search failed: ${res.status} ${res.statusText}`);
    }

    const body: ApiSearchResponse = await res.json();

    if (!body.results) {
      throw new Error("ClawHub search returned no results field");
    }

    // Map actual API field names to our UI-friendly names
    const results: HubSearchResult[] = body.results
      .filter((s) => s.slug) // filter out entries without slugs
      .map((s) => ({
        slug: s.slug!,
        name: s.displayName || s.slug!,
        description: s.summary || "",
        version: s.version || undefined,
      }));

    return { results };
  }

  async getSkill(slug: string): Promise<HubSkillDetail> {
    const url = `${this.baseUrl}/skills/${encodeURIComponent(slug)}`;
    logger.info(`Fetching skill detail: ${slug}`);

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`ClawHub skill detail failed: ${res.status} ${res.statusText}`);
    }

    const body: ApiSkillResponse = await res.json();

    if (!body.skill) {
      throw new Error(`Skill "${slug}" not found`);
    }

    const firstTag = Object.keys(body.skill.tags || {})[0];

    return {
      slug: body.skill.slug,
      name: body.skill.displayName,
      description: body.skill.summary || "",
      version: body.latestVersion?.version,
      category: firstTag,
      author: body.owner?.handle || body.owner?.displayName || undefined,
      downloads: body.skill.stats?.downloads,
    };
  }

  async downloadAndInstall(slug: string, targetDir: string): Promise<{ success: boolean; skillName?: string; error?: string }> {
    // First, get skill detail to determine category/name for installation path
    let skillName = slug;
    let category = "downloaded";
    try {
      const detail = await this.getSkill(slug);
      if (detail.name) skillName = detail.name;
      if (detail.category) category = detail.category;
    } catch {
      // If detail fetch fails, still try the download with slug-derived names
    }

    const url = `${this.baseUrl}/download?slug=${encodeURIComponent(slug)}`;
    logger.info(`Downloading skill: ${slug}`);

    const res = await fetch(url);
    if (!res.ok) {
      if (res.status === 429) {
        return { success: false, error: "Rate limited. Please wait a moment and try again." };
      }
      return { success: false, error: `Download failed: ${res.status} ${res.statusText}` };
    }

    const arrayBuffer = await res.arrayBuffer();
    const zipBuffer = Buffer.from(arrayBuffer);

    // Write to temp file
    const tmpFile = path.join(os.tmpdir(), `clawhub-${slug}-${Date.now()}.zip`);
    fs.writeFileSync(tmpFile, zipBuffer);

    try {
      const zip = new AdmZip(tmpFile);
      const entries = zip.getEntries();

      // Validate we have a SKILL.md somewhere
      const skillMdEntry = entries.find((e) => e.entryName.endsWith("SKILL.md") || e.entryName.endsWith("skill.md"));
      if (skillMdEntry) {
        const content = skillMdEntry.getData().toString("utf-8");
        const nameMatch = content.match(/^name:\s*(.+)$/m);
        if (nameMatch) skillName = nameMatch[1].trim();
        // Only override category from frontmatter if it explicitly exists
        const catMatch = content.match(/^category:\s*(.+)$/m);
        if (catMatch) category = catMatch[1].trim();
      }

      // Sanitize name for filesystem
      const safeName = skillName.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
      const safeCategory = category.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase();
      const installDir = path.join(targetDir, safeName);
      fs.mkdirSync(installDir, { recursive: true });

      // Determine root prefix to strip (ZIP often wraps in a top-level dir)
      let rootPrefix = "";
      const topDir = entries.find(
        (e) => e.isDirectory && e.entryName.split("/").filter(Boolean).length <= 1
      );
      if (topDir && topDir.entryName !== "/" && topDir.entryName !== "./") {
        rootPrefix = topDir.entryName;
      }

      for (const entry of entries) {
        let relPath = entry.entryName;
        if (rootPrefix && relPath.startsWith(rootPrefix)) {
          relPath = relPath.slice(rootPrefix.length);
        }
        // Remove leading slash
        if (relPath.startsWith("/")) relPath = relPath.slice(1);
        if (!relPath || relPath === "/" || relPath === ".") continue;

        const targetPath = path.join(installDir, relPath);
        // Prevent path traversal
        if (!targetPath.startsWith(installDir)) continue;

        if (entry.isDirectory) {
          fs.mkdirSync(targetPath, { recursive: true });
        } else {
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          fs.writeFileSync(targetPath, entry.getData());
        }
      }

      logger.info(`Skill installed: ${safeName}`);
      return { success: true, skillName: safeName };
    } catch (err: any) {
      return { success: false, error: `Extraction failed: ${err.message}` };
    } finally {
      try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
    }
  }

}
