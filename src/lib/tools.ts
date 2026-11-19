/** How each AI tool invokes an expert agent served by the MCP server. Kept free of catalog data so pages can ship it to the browser. */
export const TOOLS = [
  { id: "claude", name: "Claude Code", hint: "Type", command: (n: string) => `/mcp__ide-expert-agents__${n}` },
  { id: "cursor", name: "Cursor", hint: "In agent mode, type / and pick", command: (n: string) => n },
  { id: "copilot", name: "GitHub Copilot", hint: "Type", command: (n: string) => `/mcp.ide-expert-agents.${n}` },
] as const;
