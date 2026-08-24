import http from "node:http";
import { readFile } from "node:fs/promises";
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const required = ["FIREBASE_SERVICE_ACCOUNT_JSON_B64", "DASHBOARD_USERNAME", "DASHBOARD_PASSWORD", "PORT"];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required for the QUOS Bots dashboard.`);

const credential = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64, "base64").toString("utf8"));
if (typeof credential.private_key === "string") credential.private_key = credential.private_key.replace(/\\n/g, "\n");
const app = getApps()[0] || initializeApp({ credential: cert(credential) });
const firestore = getFirestore(app);
const html = await readFile(new URL("./public/index.html", import.meta.url), "utf8");
const firebaseCollections = ["botProfiles", "knowledge", "reports", "runs", "tasks", "earnings"];

function authorized(req) {
  const value = Buffer.from(`${process.env.DASHBOARD_USERNAME}:${process.env.DASHBOARD_PASSWORD}`).toString("base64");
  return req.headers.authorization === `Basic ${value}`;
}

function summarize(payload = {}) {
  const profiles = Object.values(payload.botProfiles || {}).sort((a, b) => a.id.localeCompare(b.id));
  const earnings = Array.isArray(payload.earnings) ? payload.earnings : [];
  return {
    updatedAt: payload.health?.lastGatewayEventAt || null,
    gateway: payload.health?.gateway || "unknown",
    bots: profiles,
    tasks: (payload.tasks || []).slice(0, 50),
    earnings: {
      currency: "USD",
      total: earnings.reduce((total, entry) => total + (entry.currency === "USD" ? Number(entry.amount) || 0 : 0), 0),
      entries: earnings.slice(0, 50),
    },
    reports: (payload.reports || []).slice(0, 12),
    quotaNotice: "Data reflects actual persisted runtime records. Earnings are ledger entries, not claimed revenue or payout verification.",
  };
}

async function readRuntimeState() {
  const root = firestore.collection("quosBots").doc("runtimeState");
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
  return payload;
}

http.createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: true }));
  }
  if (!authorized(req)) {
    res.writeHead(401, { "www-authenticate": "Basic realm=QUOS Operations", "content-type": "text/plain" });
    return res.end("Operator authentication required.");
  }
  if (req.url === "/api/overview") {
    try {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify(summarize(await readRuntimeState())));
    } catch (error) {
      res.writeHead(503, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "Firebase state is unavailable.", detail: error instanceof Error ? error.message : "unknown error" }));
    }
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  return res.end(html);
}).listen(Number(process.env.PORT), () => console.log("QUOS Render dashboard listening on the configured port."));
