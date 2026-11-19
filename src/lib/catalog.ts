import expertData from "../data/expert-agents.json";
import frameworkData from "../data/delivery-framework.json";

export const expert = expertData;
export const framework = frameworkData;

export type Library = "agents" | "framework";

/** Display names and one-line summaries for the agent stores, in the order a project meets them. */
export const DISCIPLINES: Record<string, { name: string; blurb: string }> = {
  "pre-sales-agents-store": { name: "Pre-sales", blurb: "Discovery, estimates, proposals and AI opportunities" },
  "analyst-agents-store": { name: "Analysis", blurb: "Stress-test requirements before they’re built" },
  "ux-agents-store": { name: "UX and design", blurb: "Personas, journeys, concepts, prototypes and audits" },
  "architect-agents-store": { name: "Architecture", blurb: "Design, review and deployment fitness" },
  "coding-agents-store": { name: "Coding", blurb: "Auth, observability, debugging and code health" },
  "qa-agents-store": { name: "Quality assurance", blurb: "Security scans, test design and accessibility" },
  "devops-agents-store": { name: "DevOps", blurb: "Infrastructure-as-code from your codebase" },
  "compliance-agents-store": { name: "Compliance and privacy", blurb: "EU AI Act and GDPR reviews" },
  "data-platform-agents-store": { name: "Data platforms", blurb: "Audit, evolve and validate a data platform" },
  "idf-agents-store": { name: "Delivery process", blurb: "Design sessions, risk, UAT and process health" },
  "delivery-agents-store": { name: "Delivery management", blurb: "Delivery health and parallel planning" },
  "feature-agents-store": { name: "Feature builders", blurb: "Build specific product features end to end" },
};

export const disciplines = Object.keys(DISCIPLINES)
  .map((id) => {
    const found = expert.disciplines.find((d) => d.id === id);
    return found ? { ...found, ...DISCIPLINES[id] } : null;
  })
  .filter((d): d is NonNullable<typeof d> => d !== null)
  // Stores that appear in the repo after this list was written still show, under their folder name.
  .concat(
    expert.disciplines
      .filter((d) => !DISCIPLINES[d.id])
      .map((d) => ({ ...d, name: d.id.replace(/-agents-store$/, "").replace(/-/g, " "), blurb: "" })),
  );

export const disciplineName = (id: string) => disciplines.find((d) => d.id === id)?.name ?? id;

export const CLASSIFICATION_LABELS: Record<string, { name: string; hint: string }> = {
  standalone: { name: "Standalone", hint: "Works on its own: copy it in and run it" },
  "needs-config": { name: "Needs config", hint: "Works once you give it one small setting" },
  "framework-only": { name: "Framework only", hint: "Needs the full framework installed first" },
};

export { TOOLS } from "./tools";

/**
 * Where agents and skills from both libraries fit in the framework's delivery loop.
 * Names must match the synced data; the build fails if one goes missing.
 */
export const LOOP = [
  {
    id: "inception",
    name: "Inception",
    gist: "Shape the intent and lock what will be built",
    framework: ["solution-shaping", "design-session"],
    agents: ["discovery-interview", "elaborate", "requirement-analyzer", "persona-builder", "estimate"],
  },
  {
    id: "build",
    name: "Build",
    gist: "Deliver in small, risk-checked bolts",
    framework: ["bolt-risk-assessment", "uat"],
    agents: ["design-concept-lab", "auth-implementer", "test-case-generator", "owasp-security-scanner", "iac-generator"],
  },
  {
    id: "operate",
    name: "Operate",
    gist: "Release, watch production and fix what breaks",
    framework: ["release-readiness-checklist", "hotfix-bolt", "root-cause-analysis"],
    agents: ["smoke-sanity-testing", "observability-implementer", "runtime-debugger"],
  },
  {
    id: "improvements",
    name: "Improvements",
    gist: "Turn what you learned into better rules",
    framework: ["knowledge-promotion", "process-health"],
    agents: ["delivery-commitment-health-report", "dependency-audit"],
  },
] as const;

for (const stage of LOOP) {
  for (const n of stage.framework)
    if (!framework.skills.some((s) => s.name === n)) throw new Error(`LOOP: framework skill "${n}" not found`);
  for (const n of stage.agents)
    if (!expert.agents.some((a) => a.name === n)) throw new Error(`LOOP: expert agent "${n}" not found`);
}

export const agentByName = (n: string) => expert.agents.find((a) => a.name === n)!;
export const skillByName = (n: string) => framework.skills.find((s) => s.name === n)!;

/** One flat list for the command palette, across both libraries. */
export type SearchItem = {
  id: string;
  library: Library;
  title: string;
  group: string;
  summary: string;
  text: string;
  name: string;
  how?: string | null;
  href: string;
};

export const sentence = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function searchIndex(base: string): SearchItem[] {
  const agents: SearchItem[] = expert.agents.map((a) => ({
    id: `agent:${a.name}`,
    library: "agents",
    title: a.title,
    group: disciplineName(a.discipline),
    summary: a.whenToUse,
    text: `${a.name} ${a.title} ${disciplineName(a.discipline)} ${a.whenToUse} ${a.description}`.toLowerCase(),
    name: a.name,
    href: `${base}expert-agents/#${a.name}`,
  }));
  const skills: SearchItem[] = framework.skills.map((s) => ({
    id: `skill:${s.name}`,
    library: "framework",
    title: s.title,
    group: s.category,
    summary: sentence(s.whenToInvoke ?? s.summary),
    text: `${s.name} ${s.title} ${s.category} ${s.summary} ${s.whenToInvoke ?? ""}`.toLowerCase(),
    name: s.name,
    how: s.howToInvoke,
    href: `${base}delivery-framework/#skill-${s.name}`,
  }));
  return [...agents, ...skills];
}

export const totals = {
  agents: expert.agents.length,
  disciplines: disciplines.length,
  frameworkAgents: framework.agents.length,
  frameworkSkills: framework.skills.length,
  activities: framework.phases.reduce((n, p) => n + p.activities.length, 0),
};
