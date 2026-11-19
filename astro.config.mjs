// @ts-check
import { defineConfig } from "astro/config";

// SITE_URL and BASE_PATH let the same build run at a domain root or under a sub-path,
// e.g. GitHub Pages serves this repo at https://xianix-team.github.io/copilots-studio/.
export default defineConfig({
  site: process.env.SITE_URL ?? "https://xianix-team.github.io",
  base: process.env.BASE_PATH ?? "/",
  trailingSlash: "always",
});
