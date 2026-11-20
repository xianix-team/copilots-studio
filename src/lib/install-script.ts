/**
 * Builds the bash script a user downloads from the skill cart.
 *
 * The script doesn't copy skills itself. It downloads the official installer
 * (scripts/install-skills.sh in ide-expert-agents) pinned to the commit the site was synced from,
 * checks its SHA-256 fingerprint, and answers the installer's questions with the cart's choices.
 *
 * The installer asks, in order:
 *   1. Where is your project?            -> the folder the user gives this script
 *   2. Which tool do you use?            -> tool names, e.g. "claude cursor"
 *   3. Skills to install:                -> skill names, e.g. "runtime-debugger bug-report"
 *   4. Go ahead? [Y/n]                   -> "y"
 *   5. '<name>' is already installed. Replace it? [y/N/a]   (only for skills already there)
 *                                        -> "a" to replace all; no answer keeps them
 * If the installer's questions change, re-run `npm run sync`: the pin and fingerprint move to the
 * new version, and this sequence must be checked against it.
 *
 * Kept free of catalog data so the page can ship it to the browser.
 */

export const INSTALL_TOOLS = [
  { id: "claude", name: "Claude Code", dir: ".claude/skills" },
  { id: "copilot", name: "GitHub Copilot", dir: ".github/skills" },
  { id: "cursor", name: "Cursor", dir: ".cursor/skills" },
] as const;

export type InstallToolId = (typeof INSTALL_TOOLS)[number]["id"];

export type Installer = { url: string; sha256: string; commit: string; repo: string };

export type InstallScriptOptions = {
  skills: string[];
  tools: string[];
  replaceExisting: boolean;
  installer: Installer;
  siteUrl: string;
  generatedAt?: Date;
};

export const SCRIPT_FILENAME = "install-99x-skills.sh";

// Only these characters ever reach the script, so nothing a user picks can change what it runs.
const SKILL_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;

export function buildInstallScript(o: InstallScriptOptions): string {
  const skills = [...new Set(o.skills)];
  const tools = INSTALL_TOOLS.filter((t) => o.tools.includes(t.id));

  if (skills.length === 0) throw new Error("Add at least one skill.");
  if (tools.length === 0) throw new Error("Choose at least one tool.");
  const bad = skills.find((s) => !SKILL_NAME.test(s));
  if (bad) throw new Error(`Not a valid skill name: ${bad}`);
  if (!SHA256.test(o.installer.sha256) || !COMMIT.test(o.installer.commit))
    throw new Error("The installer details are malformed. Re-run the catalog sync.");
  if (!o.installer.url.startsWith("https://raw.githubusercontent.com/") || /['"$`\\\s]/.test(o.installer.url))
    throw new Error("The installer URL is not a GitHub raw URL.");
  const siteUrl = /^https?:\/\/[^\s'"$`\\]+$/.test(o.siteUrl) ? o.siteUrl : "the 99x Copilots Studio site";
  o = { ...o, siteUrl };

  const date = (o.generatedAt ?? new Date()).toISOString().slice(0, 10);
  const list = (items: string[], indent: string) => {
    // Wrap a comma-separated list at about 76 characters for the header comment.
    const lines: string[] = [];
    let line = "";
    for (const item of items) {
      const next = line ? `${line}, ${item}` : item;
      if (next.length > 76 - indent.length && line) {
        lines.push(line + ",");
        line = item;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines.join(`\n#${indent}`);
  };

  return `#!/usr/bin/env bash
#
# Installs ${skills.length} IDE Expert ${skills.length === 1 ? "Agent" : "Agents"} as native skills, picked in 99x Copilots Studio.
# Generated ${date} from ${o.siteUrl}
#
# Skills: ${list(skills, "         ")}
# Tools:  ${tools.map((t) => `${t.name} (${t.dir}/)`).join(", ")}
#
# Run it from your project folder, or pass the folder:
#
#   bash ${SCRIPT_FILENAME}
#   bash ${SCRIPT_FILENAME} ~/code/my-project
#
# How it works: it downloads the official installer, scripts/install-skills.sh from
# ${o.installer.repo}, pinned to commit ${o.installer.commit.slice(0, 7)}, checks its SHA-256
# fingerprint, then answers the installer's questions with the choices above.
# The skills themselves come from the latest main branch.
#
# Needs bash, git and curl. On Windows, run it from Git Bash or WSL.

set -euo pipefail

SKILLS=(${skills.join(" ")})
TOOLS=(${tools.map((t) => t.id).join(" ")})
REPLACE_EXISTING=${o.replaceExisting ? "yes" : "no"}   # yes: replace skills that are already installed. no: keep them.

INSTALLER_URL="${o.installer.url}"
INSTALLER_SHA256="${o.installer.sha256}"

die() { printf 'Error: %s\\n' "$*" >&2; exit 1; }

command -v curl >/dev/null 2>&1 || die "curl is not installed. Install it and run this again."
command -v git >/dev/null 2>&1 || die "git is not installed. Install it and run this again."

# 1. The project to install into.
project="\${1:-}"
if [ -z "$project" ]; then
  read -e -r -p "Where is your project? (press Enter for $PWD) " project || true
fi
project="\${project:-$PWD}"
project="\${project/#\\~/$HOME}"
[ -d "$project" ] || die "Not a folder: $project"
project="$(cd "$project" && pwd)"

# 2. Download the installer and check it's the exact version this script was made for.
work="$(mktemp -d "\${TMPDIR:-/tmp}/99x-skills.XXXXXX")" || die "Could not create a temp folder."
trap 'rm -rf "$work"' EXIT

echo "Downloading the installer…"
curl -fsSL "$INSTALLER_URL" -o "$work/install-skills.sh" \\
  || die "Could not download the installer from $INSTALLER_URL. Check your network and GitHub access."

if command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$work/install-skills.sh" | cut -d' ' -f1)"
elif command -v sha256sum >/dev/null 2>&1; then
  actual="$(sha256sum "$work/install-skills.sh" | cut -d' ' -f1)"
else
  die "Need shasum or sha256sum to check the installer. Nothing was installed."
fi
[ "$actual" = "$INSTALLER_SHA256" ] \\
  || die "The installer doesn't match its expected fingerprint, so it wasn't run. Nothing was installed."

# 3. Run it, answering its questions: project, tools, skills, go ahead, replace existing.
answers() {
  printf '%s\\n' "$project"
  printf '%s\\n' "\${TOOLS[*]}"
  printf '%s\\n' "\${SKILLS[*]}"
  printf 'y\\n'
  if [ "$REPLACE_EXISTING" = "yes" ]; then printf 'a\\n'; fi
}

if ! answers | bash "$work/install-skills.sh"; then
  die "The installer stopped before finishing. If it said a skill wasn't found, it may have been renamed or removed: pick your skills again at ${o.siteUrl}"
fi
`;
}
