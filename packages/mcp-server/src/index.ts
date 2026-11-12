#!/usr/bin/env node
/**
 * munchmap MCP server — local stdio entry point.
 * Plug this into the AI you already use (Claude, Gemini CLI, Cursor, Antigravity…). Costs the project nothing.
 * Your profile is stored only on this device (~/.munchmap/profile.json).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDataset } from "./data.ts";
import { readProfile, writeProfile } from "./profile.ts";
import { createServer } from "./server.ts";

const server = createServer({
  getDataset,
  profile: { read: readProfile, write: writeProfile },
  repo: process.env.MUNCHMAP_REPO,
  overpassUrl: process.env.MUNCHMAP_OVERPASS_URL,
});

await server.connect(new StdioServerTransport());
console.error("[munchmap] MCP server running on stdio");
