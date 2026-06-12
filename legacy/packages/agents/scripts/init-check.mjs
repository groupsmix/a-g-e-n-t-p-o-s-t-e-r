/**
 * Runtime smoke test: load .env from repo root and initialize Mastra.
 * Usage: node packages/agents/scripts/init-check.mjs
 */
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
config({ path: resolve(root, ".env") });

const { createMastra } = await import("../dist/mastra.js");
const instance = createMastra();
const agentIds = Object.keys(instance.getAgents?.() ?? {});
console.log("Mastra initialized. Agents:", agentIds.join(", ") || "(none)");
process.exit(0);
