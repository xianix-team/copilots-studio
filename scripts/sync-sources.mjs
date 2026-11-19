#!/usr/bin/env node
// Pulls catalog data from the two featured repositories into src/data/*.json.
//
//   npm run sync                        # shallow-clones both repos from GitHub
//   IDE_EXPERT_AGENTS_PATH=../ide-expert-agents \
//   AI_DLC_BASE_PATH=../ai-dlc-base npm run sync   # uses local clones instead
//
// The generated JSON is committed, so the site builds without network access.
// Re-run this script whenever either repository changes.

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

const SOURCES = {
  ideExpertAgents: {
    repo: "xianix-team/ide-expert-agents",
    env: "IDE_EXPERT_AGENTS_PATH",
  },
  aiDlcBase: {
    repo: "xianix-team/ai-dlc-base",
    env: "AI_DLC_BASE_PATH",
  },
};

const OUT_DIR = new URL("../src/data/", import.meta.url);
const tempDirs = [];

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function checkout({ repo, env }) {
  const local = process.env[env];
  if (local) {
    if (!existsSync(local)) throw new Error(`${env} points to ${local}, which does not exist`);
    console.log(`Using local clone of ${repo} at ${local}`);
    return local;
  }
  const dir = mkdtempSync(join(tmpdir(), "copilots-studio-"));
  tempDirs.push(dir);
  console.log(`Cloning ${repo}…`);
  execFileSync("git", ["clone", "--depth", "1", `https://github.com/${repo}.git`, dir], { stdio: "inherit" });
  return dir;
}

function revision(dir, repo) {
  return {
    repo,
    url: `https://github.com/${repo}`,
    commit: git(dir, "rev-parse", "--short", "HEAD"),
    date: git(dir, "log", "-1", "--format=%cs"),
  };
}

const read = (...parts) => readFileSync(join(...parts), "utf8");
// Collapses whitespace and strips inline markdown (links, bold, italics, code ticks).
const squash = (text = "") =>
  String(text)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\s)\*([^*\s][^*]*)\*/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

function frontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? parseYaml(match[1]) ?? {} : {};
}

// ---------------------------------------------------------------- ide-expert-agents

// Each agent rates its own autonomy and the human judgement its output needs: high, medium or low.
// See "Autonomy and human judgement" in the repo's CONTRIBUTING.md for what each level means.
const LEVELS = new Set(["high", "medium", "low"]);
function rating(value, where) {
  const level = String(value ?? "").trim().toLowerCase();
  if (LEVELS.has(level)) return level;
  console.warn(`  ! ${where} is ${value === undefined ? "missing" : `"${value}"`}; expected high, medium or low`);
  return null;
}

function syncExpertAgents(dir) {
  const meta = revision(dir, SOURCES.ideExpertAgents.repo);
  const catalog = JSON.parse(read(dir, "catalog.json"));
  const pkg = JSON.parse(read(dir, "mcp-server", "package.json"));

  const disciplines = [];
  const agents = [];

  for (const [store, entry] of Object.entries(catalog.stores)) {
    disciplines.push({ id: store, description: squash(entry.description), count: Object.keys(entry.agents).length });

    // Map frontmatter name -> folder, since the catalog is keyed by the agent's `name`.
    const folders = {};
    for (const folder of readdirSync(join(dir, store), { withFileTypes: true })) {
      if (!folder.isDirectory()) continue;
      const file = ["agent.md", "SKILL.md"].find((f) => existsSync(join(dir, store, folder.name, f)));
      if (!file) continue;
      const fm = frontmatter(read(dir, store, folder.name, file));
      if (fm.name)
        folders[fm.name] = {
          folder: folder.name,
          description: squash(fm.description),
          autonomy: rating(fm.autonomy, `${store}/${folder.name} autonomy`),
          humanJudgement: rating(fm["human-judgement"], `${store}/${folder.name} human-judgement`),
        };
    }

    for (const [name, info] of Object.entries(entry.agents)) {
      const found = folders[name];
      if (!found) {
        console.warn(`  ! ${store}/${name} is in catalog.json but no agent file declares that name`);
        continue;
      }
      agents.push({
        name,
        title: squash(info.title),
        whenToUse: squash(info.whenToUse),
        description: found.description,
        autonomy: found.autonomy,
        humanJudgement: found.humanJudgement,
        discipline: store,
        source: `${meta.url}/tree/main/${store}/${found.folder}`,
      });
    }
  }

  return {
    ...meta,
    npmPackage: pkg.name,
    disciplines,
    agents,
  };
}

// ---------------------------------------------------------------- ai-dlc-base

const CLASSIFICATIONS = {
  "◆ Standalone": "standalone",
  "◈ Needs config": "needs-config",
  "◇ Framework-only": "framework-only",
};

function syncDeliveryFramework(dir) {
  const meta = revision(dir, SOURCES.aiDlcBase.repo);
  const skillsDir = "repository-agents/process-onboarding-agent/skills";

  // Skills: parsed from the skills agent's catalogue, which groups and classifies every skill.
  const guide = read(dir, "repository-agents/process-skills-agent/skills-guide.md").split("\n");
  const skills = [];
  let category = null;
  for (let i = 0; i < guide.length; i++) {
    const heading = guide[i].match(/^###\s+(.+)$/);
    if (heading) {
      category = heading[1].trim();
      continue;
    }
    const m = guide[i].match(/^\*\*(.+?)\*\* \(`([\w-]+\.md)`\) `(.+?)`/);
    if (!m || !category || !CLASSIFICATIONS[m[3]]) continue;
    const body = [];
    for (let j = i + 1; j < guide.length; j++) {
      const line = guide[j];
      if (/^\*\*.+\*\* \(`/.test(line) || /^#{2,3}\s/.test(line)) break;
      body.push(line);
    }
    const text = body.join("\n");
    const summary = squash(text.split(/\n\s*-\s+\*\*/)[0].split(/\n>/)[0]);
    const when = text.match(/\*\*When to invoke:\*\*\s*(.+)/);
    const how = text.match(/\*\*How to invoke:\*\*\s*`"?([^`]+?)"?`/);    const file = m[2];
    if (!existsSync(join(dir, skillsDir, file))) {
      console.warn(`  ! ${file} is listed in skills-guide.md but missing from ${skillsDir}`);
      continue;
    }
    skills.push({
      name: file.replace(/\.md$/, ""),
      title: m[1].trim(),
      category: titleCase(category),
      classification: CLASSIFICATIONS[m[3]],
      summary,
      whenToInvoke: when ? squash(when[1]) : null,
      howToInvoke: how ? squash(how[1]).replace(/\[skill-path\]/g, "process-onboarding-agent/skills") : null,
      source: `${meta.url}/blob/main/${skillsDir}/${file}`,
    });
  }

  // Agent suite: the table under "## Agent Suite" in the README.
  const readme = read(dir, "README.md");
  const suite = readme.split(/^## Agent Suite\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  const agents = suite
    .split("\n")
    .filter((l) => /^\|\s*\*\*/.test(l))
    .map((l) => {
      const [name, does, entry] = l.split("|").slice(1, -1).map((c) => c.trim());
      return {
        name: squash(name),
        does: squash(does),
        entryPoint: entry.replace(/`/g, ""),
      };
    });

  // Incremental adoption: three phases of activities that plug into existing ceremonies.
  const adoption = read(dir, "readme-content/incremental-adoption.md");
  const phases = [...adoption.matchAll(/^### Phase (\d) — (.+)$\n+([^\n]+)\n([\s\S]*?)(?=^### |^---|$(?![\s\S]))/gm)].map((p) => ({
    phase: Number(p[1]),
    title: p[2].trim(),
    intro: squash(p[3]),
    activities: p[4]
      .split("\n")
      .filter((l) => /^\|\s*\d+\s*\|/.test(l))
      .map((l) => {
        const [n, activity, does, buildsToward] = l.split("|").slice(1, -1).map((c) => c.trim());
        return { n: Number(n), activity: squash(activity), does: squash(does), buildsToward: squash(buildsToward) };
      }),
  }));

  return { ...meta, skills, agents, phases };
}

function titleCase(upper) {
  const small = new Set(["and", "or", "of", "the", "&"]);
  return upper
    .toLowerCase()
    .split(" ")
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}

// ---------------------------------------------------------------- run

try {
  const expert = syncExpertAgents(checkout(SOURCES.ideExpertAgents));
  const framework = syncDeliveryFramework(checkout(SOURCES.aiDlcBase));

  if (expert.agents.length === 0) throw new Error("No expert agents found: has catalog.json moved?");
  if (framework.skills.length === 0) throw new Error("No framework skills found: has skills-guide.md changed format?");
  if (framework.agents.length === 0) throw new Error("No framework agents found: has the README's Agent Suite table moved?");

  writeFileSync(new URL("expert-agents.json", OUT_DIR), JSON.stringify(expert, null, 2) + "\n");
  writeFileSync(new URL("delivery-framework.json", OUT_DIR), JSON.stringify(framework, null, 2) + "\n");

  console.log(`ide-expert-agents @ ${expert.commit}: ${expert.agents.length} agents in ${expert.disciplines.length} disciplines`);
  console.log(
    `ai-dlc-base @ ${framework.commit}: ${framework.agents.length} agents, ${framework.skills.length} skills, ` +
      `${framework.phases.reduce((n, p) => n + p.activities.length, 0)} adoption activities`,
  );
} finally {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
}
