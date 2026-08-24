import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import pg from "pg";

export const defaultState = {
  nextPersonaIndex: 1,
  channels: {},
  knowledge: [],
  reports: [],
  runs: [],
  botProfiles: {},
  tasks: [],
  earnings: [],
  health: { gateway: "not_started", lastGatewayEventAt: null },
};

const firebaseCollections = ["botProfiles", "knowledge", "reports", "runs", "tasks", "earnings", "publicTasks", "publicEarnings"];
let firebaseSnapshot = null;
let pool;
let firestore;

export function statePath() {
  return resolve(process.env.QUOS_STATE_PATH || "./data/quos-state.json");
}

const usePostgres = () => process.env.STATE_BACKEND === "postgres";
const useFirebase = () => process.env.STATE_BACKEND === "firebase";
const stateDocumentId = "runtimeState";

function normalizeState(payload = {}) {
  return {
    ...structuredClone(defaultState),
    ...payload,
    channels: { ...(payload.channels || {}) },
    botProfiles: { ...(payload.botProfiles || {}) },
    health: { ...defaultState.health, ...(payload.health || {}) },
    knowledge: Array.isArray(payload.knowledge) ? payload.knowledge : [],
    reports: Array.isArray(payload.reports) ? payload.reports : [],
    runs: Array.isArray(payload.runs) ? payload.runs : [],
    tasks: Array.isArray(payload.tasks) ? payload.tasks : [],
    earnings: Array.isArray(payload.earnings) ? payload.earnings : [],
  };
}

function firebaseCredential() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64
    ? Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64, "base64").toString("utf8")
    : process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON_B64 is required when STATE_BACKEND=firebase.");
  const credential = JSON.parse(raw);
  if (typeof credential.private_key === "string") credential.private_key = credential.private_key.replace(/\\n/g, "\n");
  return credential;
}

async function firebaseDatabase() {
  if (!firestore) {
    const app = getApps()[0] || initializeApp({ credential: cert(firebaseCredential()) });
    firestore = getFirestore(app);
  }
  return firestore;
}

export async function fetchDashboardControls() {
  if (!useFirebase()) return new Map();
  const db = await firebaseDatabase();
  const snapshot = await db.collection("dashboardControls").get();
  return new Map(snapshot.docs.map(document => [document.id, document.data()]));
}

export async function fetchQueuedDashboardTasks() {
  if (!useFirebase()) return [];
  const db = await firebaseDatabase();
  const snapshot = await db.collection("dashboardTasks").where("status", "==", "queued").limit(25).get();
  return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
}

export async function markDashboardTask(taskId, status, detail) {
  if (!useFirebase()) return;
  const db = await firebaseDatabase();
  await db.collection("dashboardTasks").doc(taskId).set({ status, handledAt: new Date().toISOString(), runtimeDetail: detail }, { merge: true });
}

async function databasePool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required when STATE_BACKEND=postgres.");
  if (!pool) {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false } });
    await pool.query("CREATE TABLE IF NOT EXISTS quos_state (id text PRIMARY KEY, payload jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())");
  }
  return pool;
}

function recordMap(state, collection) {
  const records = collection === "botProfiles" ? Object.values(state.botProfiles)
    : collection === "publicTasks" ? state.tasks.map(({ id, personaId, type, outcome, createdAt }) => ({ id, personaId, type, outcome, createdAt }))
      : collection === "publicEarnings" ? state.earnings.map(({ id, personaId, amount, currency, createdAt }) => ({ id, personaId, amount, currency, createdAt }))
        : state[collection];
  return new Map(records.map(record => [record.id, record]));
}

async function commitInChunks(db, operations) {
  for (let offset = 0; offset < operations.length; offset += 400) {
    const batch = db.batch();
    for (const operation of operations.slice(offset, offset + 400)) {
      if (operation.kind === "delete") batch.delete(operation.ref);
      else batch.set(operation.ref, operation.data);
    }
    await batch.commit();
  }
}

async function loadFirebaseState() {
  const db = await firebaseDatabase();
  const root = db.collection("quosBots").doc(stateDocumentId);
  const [metadata, ...collections] = await Promise.all([
    root.get(),
    ...firebaseCollections.map(collection => root.collection(collection).get()),
  ]);
  const payload = { ...(metadata.data()?.metadata || {}) };
  firebaseCollections.forEach((collection, index) => {
    const records = collections[index].docs.map(document => document.data());
    payload[collection] = collection === "botProfiles"
      ? Object.fromEntries(records.map(record => [record.id, record]))
      : records.sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || "")));
  });
  const state = normalizeState(payload);
  firebaseSnapshot = structuredClone(state);
  return state;
}

async function saveFirebaseState(state) {
  const db = await firebaseDatabase();
  const root = db.collection("quosBots").doc(stateDocumentId);
  const previous = firebaseSnapshot || structuredClone(defaultState);
  const metadata = { nextPersonaIndex: state.nextPersonaIndex, channels: state.channels, health: state.health };
  const previousMetadata = { nextPersonaIndex: previous.nextPersonaIndex, channels: previous.channels, health: previous.health };
  if (JSON.stringify(metadata) !== JSON.stringify(previousMetadata)) {
    await root.set({ metadata, updatedAt: new Date().toISOString(), schemaVersion: 3 }, { merge: true });
  }
  const operations = [];
  for (const collection of firebaseCollections) {
    const currentRecords = recordMap(state, collection);
    const previousRecords = recordMap(previous, collection);
    for (const [id, record] of currentRecords) {
      if (JSON.stringify(record) !== JSON.stringify(previousRecords.get(id))) {
        operations.push({ kind: "set", ref: root.collection(collection).doc(id), data: record });
      }
    }
    for (const id of previousRecords.keys()) {
      if (!currentRecords.has(id)) operations.push({ kind: "delete", ref: root.collection(collection).doc(id) });
    }
  }
  if (operations.length) await commitInChunks(db, operations);
  firebaseSnapshot = structuredClone(state);
}

export async function loadState() {
  if (useFirebase()) return loadFirebaseState();
  if (usePostgres()) {
    const db = await databasePool();
    const result = await db.query("SELECT payload FROM quos_state WHERE id = $1", ["primary"]);
    return normalizeState(result.rows[0]?.payload);
  }
  try {
    return normalizeState(JSON.parse(await readFile(statePath(), "utf8")));
  } catch (error) {
    if (error?.code === "ENOENT") return structuredClone(defaultState);
    throw error;
  }
}

export async function saveState(state) {
  if (useFirebase()) return saveFirebaseState(state);
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

export function appendBounded(items, item, max = 250) {
  items.unshift(item);
  items.splice(max);
}

export function ensureBotProfiles(state, personas) {
  for (const persona of personas.filter(item => item.id !== "QB-000")) {
    state.botProfiles[persona.id] ||= {
      id: persona.id,
      role: persona.role,
      group: persona.group,
      channelSlug: persona.channelSlug,
      operationalStatus: "idle",
      lastActivityAt: null,
      completedTasks: 0,
      earningsTotal: 0,
      earningsCurrency: "USD",
    };
  }
}

export function recordTask(state, persona, type, outcome, summary) {
  const createdAt = new Date().toISOString();
  appendBounded(state.tasks, { id: crypto.randomUUID(), personaId: persona.id, type, outcome, summary, createdAt });
  const profile = state.botProfiles[persona.id];
  if (profile) {
    profile.lastActivityAt = createdAt;
    profile.operationalStatus = outcome === "failed" ? "attention" : outcome === "assigned" || outcome === "working" ? "working" : "active";
    if (outcome === "completed") profile.completedTasks += 1;
  }
}

export function recordEarning(state, persona, amount, currency, note) {
  const createdAt = new Date().toISOString();
  const entry = { id: crypto.randomUUID(), personaId: persona.id, amount, currency, note, createdAt };
  appendBounded(state.earnings, entry);
  const profile = state.botProfiles[persona.id];
  if (profile && currency === profile.earningsCurrency) profile.earningsTotal += amount;
  return entry;
}
