import { firebaseConfig } from "./firebase-config.js?v=auth-free-20260825";
import { PERSONAS } from "./personas.js";

const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("REPLACE_");
const state = { profiles: new Map(), tasks: [], workspaceTasks: [], earnings: [], browserEarnings: [], controls: new Map(), localControls: new Map(), selectedPersona: null, browserStatus: new Map(), localTasks: [], brain: [], geminiKey: "" };
let fb = {};
const byId = id => document.getElementById(id);
const formatDate = value => value ? new Date(value?.toDate?.() || value).toLocaleString() : "—";
const formatMoney = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
const now = () => new Date().toISOString();
const grid = byId("botGrid"); const cardTemplate = byId("botCard"); const dialog = byId("taskDialog"); const search = byId("search"); const groupFilter = byId("groupFilter");

for (const group of [...new Set(PERSONAS.map(persona => persona.group))].sort()) groupFilter.insertAdjacentHTML("beforeend", `<option value="${escape(group)}">${escape(group)}</option>`);

function loadBrain() {
  try { state.brain = JSON.parse(localStorage.getItem("quos-browser-brain") || "[]"); } catch { state.brain = []; }
}

function appendBrain(record) {
  const entry = { id: crypto.randomUUID(), createdAt: now(), ...record };
  state.brain.unshift(entry); state.brain.splice(250);
  localStorage.setItem("quos-browser-brain", JSON.stringify(state.brain));
  byId("brainCount").textContent = `${state.brain.length} local records`;
  return entry;
}

function exportBrain() {
  const lines = state.brain.slice().reverse().map(record => JSON.stringify(record)).join("\n");
  const blob = new Blob([lines ? `${lines}\n` : ""], { type: "application/x-ndjson" });
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "brain.jsonl" });
  link.click(); URL.revokeObjectURL(link.href);
}

function effectiveStatus(persona) {
  const control = state.localControls.get(persona.id) || state.controls.get(persona.id);
  if (control?.status === "paused") return "paused";
  return state.browserStatus.get(persona.id) || state.profiles.get(persona.id)?.operationalStatus || "idle";
}

function allTasks() {
  const merged = new Map();
  for (const task of [...state.tasks, ...state.workspaceTasks, ...state.localTasks]) merged.set(task.id, task);
  return [...merged.values()].sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || ""))).slice(0, 50);
}

function renderBots() {
  const needle = search.value.trim().toLowerCase(); const group = groupFilter.value;
  const visible = PERSONAS.filter(persona => !group || persona.group === group).filter(persona => `${persona.id} ${persona.role} ${persona.group}`.toLowerCase().includes(needle));
  grid.replaceChildren(...visible.map(persona => {
    const fragment = cardTemplate.content.cloneNode(true); const card = fragment.querySelector(".bot-card"); const status = effectiveStatus(persona);
    fragment.querySelector(".bot-id").textContent = persona.id; fragment.querySelector("h3").textContent = persona.role; fragment.querySelector(".bot-group").textContent = persona.group;
    const pill = fragment.querySelector(".status-pill"); pill.textContent = status; pill.classList.add(status);
    fragment.querySelector(".assign").onclick = () => openAssign(persona); fragment.querySelector(".pause").onclick = () => togglePause(persona);
    card.dataset.persona = persona.id; return fragment;
  }));
  byId("metricBots").textContent = PERSONAS.length;
  byId("metricOnline").textContent = PERSONAS.filter(persona => effectiveStatus(persona) === "active").length;
  byId("metricWorking").textContent = PERSONAS.filter(persona => effectiveStatus(persona) === "working").length;
}

function renderActivity() {
  const tasks = allTasks();
  byId("metricTasks").textContent = tasks.length;
  byId("taskCount").textContent = `${tasks.length} records`;
  byId("taskRows").innerHTML = tasks.length ? tasks.map(task => `<tr><td>${formatDate(task.createdAt)}</td><td>${escape(task.personaId)}</td><td>${escape(task.type || task.summary || task.brief)}</td><td>${escape(task.outcome || task.status || "queued")}</td></tr>`).join("") : "<tr><td colspan=\"4\">No task history was returned.</td></tr>";
  const earnings = [...new Map([...state.earnings, ...state.browserEarnings].map(entry => [entry.id, entry])).values()];
  const total = earnings.reduce((sum, entry) => sum + (entry.currency === "USD" ? Number(entry.amount) || 0 : 0), 0);
  byId("metricEarnings").textContent = formatMoney(total);
  byId("earningRows").innerHTML = earnings.length ? earnings.map(entry => `<tr><td>${formatDate(entry.createdAt)}</td><td>${escape(entry.personaId)}</td><td>${formatMoney(entry.amount)}</td><td>${escape(entry.note)}</td></tr>`).join("") : "<tr><td colspan=\"4\">No verified ledger entries.</td></tr>";
}

function setGateway(metadata = {}) { byId("metricGateway").textContent = metadata.gateway || "browser only"; byId("metricUpdated").textContent = metadata.lastGatewayEventAt ? `updated ${formatDate(metadata.lastGatewayEventAt)}` : "No background runtime"; }

function openAssign(persona) {
  state.selectedPersona = persona; byId("dialogTitle").textContent = `RUN ${persona.id}`; byId("dialogPersona").textContent = `${persona.role} · ${persona.group}`; byId("taskBrief").value = ""; byId("geminiKey").value = "";
  byId("dialogMessage").textContent = "This task runs in this browser tab only. The Gemini key is kept in memory for this task and is never saved to Firebase, GitHub Pages, or local storage. Results stay in local browser memory and can be exported as brain.jsonl."; dialog.showModal();
}

async function togglePause(persona) {
  const current = state.localControls.get(persona.id) || state.controls.get(persona.id); const status = current?.status === "paused" ? "active" : "paused"; const action = status === "paused" ? "pause" : "reactivate";
  if (!window.confirm(`${action === "pause" ? "Kill bot" : "Reactivate bot"} ${persona.id}? This is a reversible pause for the current browser tab only and does not delete persona data.`)) return;
  state.localControls.set(persona.id, { personaId: persona.id, status }); renderBots();
}

async function browserSources(task) {
  const sources = [
    { title: `Google web search: ${task}`, url: `https://www.google.com/search?q=${encodeURIComponent(task)}`, excerpt: "Open this search result for additional public-web review.", sourceType: "web_search" },
    { title: `Google News search: ${task}`, url: `https://news.google.com/search?q=${encodeURIComponent(task)}`, excerpt: "Open this news search result for current reporting.", sourceType: "news_search" },
  ];
  try {
    const endpoint = new URL("https://en.wikipedia.org/w/api.php"); endpoint.search = new URLSearchParams({ action: "query", list: "search", srsearch: task, srlimit: "4", format: "json", origin: "*" }).toString();
    const payload = await fetch(endpoint, { signal: AbortSignal.timeout(15_000) }).then(response => response.ok ? response.json() : Promise.reject(new Error(`Wikipedia returned ${response.status}`)));
    for (const item of payload?.query?.search || []) sources.push({ title: item.title, url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(item.title).replace(/\s+/g, "_"))}`, excerpt: String(item.snippet || "").replace(/<[^>]+>/g, ""), sourceType: "wikipedia" });
  } catch (error) { console.warn("Browser Wikipedia lookup unavailable:", error.message); }
  return sources;
}

function extractGeminiText(payload) { return payload?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim() || null; }

async function browserGemini(persona, brief, sources, key) {
  const model = "gemini-2.5-flash";
  const sourceList = sources.map((source, index) => `[${index + 1}] ${source.title}\n${source.url}\n${source.excerpt}`).join("\n\n");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({ generationConfig: { maxOutputTokens: 900, temperature: 0.25 }, systemInstruction: { parts: [{ text: `You are ${persona.id}, a ${persona.role}. Answer in English in the scope of this role. Use only the supplied source bundle for current claims, cite entries as [n], acknowledge uncertainty, and do not invent citations. Do not perform external side effects.` }] }, contents: [{ role: "user", parts: [{ text: `Task: ${brief}\n\nPublic source bundle:\n${sourceList}` }] }] }),
  });
  if (!response.ok) throw new Error(`Gemini returned HTTP ${response.status}. Check the browser-session key and its API restrictions.`);
  return extractGeminiText(await response.json()) || "Gemini did not return text for this task.";
}

async function runBrowserTask() {
  const persona = state.selectedPersona; const brief = byId("taskBrief").value.trim(); const key = byId("geminiKey").value.trim();
  if (!persona || !brief) throw new Error("Select a persona and enter a task brief.");
  if (!key) throw new Error("Enter a Gemini key for this browser session. It is not saved.");
  if (effectiveStatus(persona) === "paused") throw new Error(`${persona.id} is paused. Reactivate it before running a task.`);
  state.geminiKey = key; state.browserStatus.set(persona.id, "working"); renderBots();
  byId("dialogMessage").textContent = "Collecting browser-accessible public source links…";
  try {
    const sources = await browserSources(brief);
    byId("dialogMessage").textContent = "Generating a role-aware Gemini response in this browser tab…";
    const response = await browserGemini(persona, brief, sources, state.geminiKey);
    const completedAt = now();
    const task = { id: crypto.randomUUID(), personaId: persona.id, type: "browser_task", summary: brief, outcome: "completed", response, sourceCount: sources.length, createdAt: completedAt };
    appendBrain({ type: "browser_task", personaId: persona.id, role: persona.role, task: brief, response, sources, scope: "local" });
    state.localTasks.unshift(task); state.browserStatus.set(persona.id, "active"); renderBots(); renderActivity();
    byId("dialogMessage").textContent = `Completed locally with ${sources.length} source link(s). Download brain.jsonl to retain a portable audit trail.`;
  } catch (error) {
    state.browserStatus.set(persona.id, "attention"); appendBrain({ type: "browser_task_failure", personaId: persona.id, task: brief, summary: error.message, scope: "local" }); renderBots();
    throw error;
  } finally { state.geminiKey = ""; byId("geminiKey").value = ""; }
}

byId("submitTask").addEventListener("click", async event => { event.preventDefault(); try { await runBrowserTask(); setTimeout(() => dialog.close(), 900); } catch (error) { byId("dialogMessage").textContent = error.message; } });
byId("brainExport").addEventListener("click", exportBrain);
search.addEventListener("input", renderBots); groupFilter.addEventListener("change", renderBots);

function bindSnapshot(source, callback) { fb.onSnapshot(source, snapshot => { byId("connection").textContent = "FIREBASE LIVE"; callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); }, error => { byId("connection").textContent = "FIREBASE READ BLOCKED"; console.warn("Firestore read blocked:", error.message); }); }

loadBrain(); byId("brainCount").textContent = `${state.brain.length} local records`;
if (configured) {
  byId("connection").textContent = "FIREBASE CONNECTING";
  const [appSdk, firestoreSdk] = await Promise.all([import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js"), import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js")]);
  fb = { ...appSdk, ...firestoreSdk }; const app = fb.initializeApp(firebaseConfig); const db = fb.getFirestore(app); window.quosDb = db;
  bindSnapshot(fb.collection(db, "quosBots", "runtimeState", "botProfiles"), rows => { state.profiles = new Map(rows.map(row => [row.id, row])); renderBots(); });
  bindSnapshot(fb.query(fb.collection(db, "quosBots", "runtimeState", "publicTasks"), fb.orderBy("createdAt", "desc"), fb.limit(50)), rows => { state.tasks = rows; renderActivity(); });
  bindSnapshot(fb.query(fb.collection(db, "quosBots", "runtimeState", "publicEarnings"), fb.orderBy("createdAt", "desc"), fb.limit(50)), rows => { state.earnings = rows; renderActivity(); });
  bindSnapshot(fb.query(fb.collection(db, "browserEarnings"), fb.orderBy("createdAt", "desc"), fb.limit(50)), rows => { state.browserEarnings = rows; renderActivity(); });
  bindSnapshot(fb.query(fb.collection(db, "browserTasks"), fb.orderBy("createdAt", "desc"), fb.limit(50)), rows => { state.workspaceTasks = rows; renderActivity(); });
  bindSnapshot(fb.collection(db, "browserBotStatuses"), rows => { rows.forEach(row => state.browserStatus.set(row.personaId, row.status)); renderBots(); });
  bindSnapshot(fb.collection(db, "dashboardControls"), rows => { state.controls = new Map(rows.map(row => [row.personaId, row])); renderBots(); });
  fb.onSnapshot(fb.doc(db, "quosBots", "runtimeState"), snapshot => setGateway(snapshot.data()?.metadata || {}));
} else { byId("connection").textContent = "FIREBASE CONFIG REQUIRED"; byId("metricGateway").textContent = "browser only"; renderBots(); renderActivity(); }
