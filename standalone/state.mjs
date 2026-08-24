import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import pg from "pg";

const defaultState = {
  nextPersonaIndex: 1,
  channels: {},
  knowledge: [],
  reports: [],
  runs: [],
};

export function statePath() {
  return resolve(process.env.QUOS_STATE_PATH || "./data/quos-state.json");
}

const usePostgres = () => process.env.STATE_BACKEND === "postgres";
let pool;

async function databasePool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required when STATE_BACKEND=postgres.");
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false } });
    await pool.query("CREATE TABLE IF NOT EXISTS quos_state (id text PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
  }
  return pool;
}

export async function loadState() {
  if (usePostgres()) {
    const db = await databasePool();
    const result = await db.query("SELECT payload FROM quos_state WHERE id = $1", ["primary"]);
    return result.rows[0]?.payload ? { ...defaultState, ...result.rows[0].payload } : structuredClone(defaultState);
  }
  try {
    const parsed = JSON.parse(await readFile(statePath(), "utf8"));
    return { ...defaultState, ...parsed };
  } catch (error) {
    if (error?.code === "ENOENT") return structuredClone(defaultState);
    throw error;
  }
}

export async function saveState(state) {
  if (usePostgres()) {
    const db = await databasePool();
    await db.query(
      "INSERT INTO quos_state (id, payload, updated_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()",
      ["primary", JSON.stringify(state)],
    );
    return;
  }
  const file = statePath();
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(state, null, 2));
}

export function appendBounded(items, item, max = 500) {
  items.unshift(item);
  items.splice(max);
}
