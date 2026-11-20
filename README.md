# copilots-studio

99x frontend application for easy onboarding of vetted copilot skills.

The site features 99x's two AI copilot libraries for product engineering teams:

- **[IDE Expert Agents](https://github.com/xianix-team/ide-expert-agents)**: specialist agents served by one MCP server as slash commands in Claude Code, Cursor and GitHub Copilot.
- **[Intent Delivery Framework](https://github.com/xianix-team/ai-dlc-base)** (`ai-dlc-base`): how a team and its AI work together, from written intent to production and back.

## Pages

| Page | What it does |
|---|---|
| `/` | A search box that matches a task to agents and skills from both libraries, how the libraries fit the delivery loop, and how to start |
| `/expert-agents/` | Every agent with its autonomy and human-judgement ratings, a map of agents by those two ratings, search and filters, the command for your tool, setup snippets, and a skill cart that downloads an install script |
| `/delivery-framework/` | The delivery loop, agent suite, founding objective, every skill by classification, incremental adoption and entry points |

## Develop

Needs Node 20 or later.

```bash
npm install
npm run dev       # http://localhost:4321
npm run build     # static site in dist/
npm run preview   # serve dist/
```

## Keep the catalog current

Agent and skill data comes from the two source repositories, not from this one. `npm run sync` reads them and rewrites `src/data/expert-agents.json` and `src/data/delivery-framework.json`. Commit those files so the site builds without network access.

```bash
npm run sync   # shallow-clones both repositories from GitHub

# or read from local clones
IDE_EXPERT_AGENTS_PATH=../ide-expert-agents AI_DLC_BASE_PATH=../ai-dlc-base npm run sync
```

What the sync reads:

- **ide-expert-agents**: `catalog.json` for titles, "when to use" text and disciplines, plus each agent's `agent.md` or `SKILL.md` frontmatter for its description and its `autonomy` and `human-judgement` ratings (high, medium or low; defined in that repo's CONTRIBUTING.md).
- **ai-dlc-base**: `repository-agents/process-skills-agent/skills-guide.md` for skills, the README's Agent Suite table, and `readme-content/incremental-adoption.md` for the adoption phases.

The script stops with an error if a source file has moved or changed format, so a broken sync never overwrites good data.

Hand-written content lives in `src/lib/catalog.ts`: discipline display names and blurbs, and which agents and skills appear at each stage of the delivery loop. The build fails if the loop names an agent or skill that no longer exists.

## Skill cart

On `/expert-agents/`, people add agents to a cart, choose their tools (Claude Code, GitHub Copilot, Cursor), and check out to download `install-99x-skills.sh`. The cart is kept in the browser's local storage.

The downloaded script doesn't copy skills itself. It downloads `scripts/install-skills.sh` from ide-expert-agents, pinned to the commit the catalog was last synced from, checks its SHA-256 fingerprint, and answers the installer's questions (project folder, tools, skills, go ahead, replace existing) with the cart's choices. The skills themselves come from the installer's latest `main`.

- The generator is `src/lib/install-script.ts`. It only accepts known tool ids and lowercase-hyphen skill names, so nothing typed into the page can reach the script.
- `npm run sync` records the installer's commit and fingerprint in `src/data/expert-agents.json`. If the installer's questions change upstream, check the answer sequence in `install-script.ts` against the new version when you re-sync.
- If the installer is missing from the repo, the sync warns and the cart is turned off.

## Deploy

`.github/workflows/deploy.yml` publishes to GitHub Pages at https://xianix-team.github.io/copilots-studio/ on every push to `main`. Before the first run, set **Settings > Pages > Source** to **GitHub Actions**.

To host elsewhere, build with `SITE_URL` and `BASE_PATH` set for the target, for example `BASE_PATH=/` for a domain root.
