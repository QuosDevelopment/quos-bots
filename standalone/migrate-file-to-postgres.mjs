import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before importing file state into PostgreSQL.");
process.env.STATE_BACKEND = "postgres";
const { saveState } = await import("./state.mjs");
const sourcePath = resolve(process.env.MIGRATION_STATE_PATH || process.env.QUOS_STATE_PATH || "./data/quos-state.json");
const state = JSON.parse(await readFile(sourcePath, "utf8"));
await saveState(state);
console.log(`Imported file state from ${sourcePath} into PostgreSQL.`);
