import { firebaseConfig } from "./firebase-config.js?v=browser-workspace-20260824";
import { PERSONAS } from "./personas.js";

const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("REPLACE_");
const state = { profiles: new Map(), tasks: [], workspaceTasks: [], earnings: [], browserEarnings: [], controls: new Map(), user: null, operator: false, selectedPersona: null, browserStatus: new Map(), localTasks: [], brain: [], geminiKey: "" };
let fb = {};
const byId = id => document.getElementById(id);
const formatDate = value => value ? new Date(value?.toDate?.() || value).toLocaleString() : "—";
const formatMoney = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));
const now = () => new Date().toISOString();
const grid = byId("botGrid"); const cardTemplate = byId("botCard"); const dialog = byId("taskDialog"); const authDialog = byId("authDialog"); const search = byId("search"); const groupFilter = byId("groupFilter");

for (const group of [...new Set(PERSONAS.map(persona => persona.group))].sort()) groupFilter.insertAdjacentHTML("beforeend", `<option value="${escape(group)}">${escape(group)}</option>`);
for (const persona of PERSONAS) byId("earningPersona").insertAdjacentHTML("beforeend", `<option value="${escape(persona.id)}">${escape(persona.id)} — ${escape(persona.role)}</option>`);

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
  const control = state.controls.get(persona.id);
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
  byId("dialogMessage").textContent = state.operator ? "This task runs in this browser tab only. The Gemini key is kept in memory for this task and is never saved to Firebase, GitHub Pages, or local storage." : "Operator sign-in is required to run and record tasks."; dialog.showModal();
}

async function requireOperator() { if (!configured) throw new Error("Firebase web configuration is not set."); if (!state.operator) throw new Error("Operator sign-in and Firebase operator authorization are required."); }

async function writeBrowserStatus(personaId, status) {
  try {
    await fb.setDoc(fb.doc(window.quosDb, "browserWorkspace", "botStatuses", personaId), { personaId, status, operatorUid: state.user.uid, updatedAt: fb.serverTimestamp() }, { merge: true });
    return null;
  } catch (error) { console.warn("Browser status was retained locally because Firebase rejected the write:", error.message); return error.message; }
}

async function persistBrowserResult(task, brainEntry) {
  try {
    const publicTask = { id: task.id, personaId: task.personaId, type: task.type, summary: task.summary, outcome: task.outcome, sourceCount: task.sourceCount };
    await Promise.all([
      fb.setDoc(fb.doc(window.quosDb, "browserWorkspace", "tasks", task.id), { ...publicTask, operatorUid: state.user.uid, createdAt: fb.serverTimestamp() }),
      fb.setDoc(fb.doc(window.quosDb, "browserWorkspace", "brain", brainEntry.id), { ...brainEntry, operatorUid: state.user.uid, createdAt: fb.serverTimestamp() }),
    ]);
    return null;
  } catch (error) { console.warn("Browser result was retained locally because Firebase rejected the write:", error.message); return error.message; }
}

async function togglePause(persona) {
  try {
    await requireOperator(); const current = state.controls.get(persona.id); const status = current?.status === "paused" ? "active" : "paused"; const action = status === "paused" ? "pause" : "reactivate";
    if (!window.confirm(`${action === "pause" ? "Kill bot" : "Reactivate bot"} ${persona.id}? “Kill bot” is a reversible browser-workspace pause; it does not delete persona data.`)) return;
    await fb.setDoc(fb.doc(window.quosDb, "dashboardControls", persona.id), { personaId: persona.id, status, operatorUid: state.user.uid, updatedAt: fb.serverTimestamp() }, { merge: true });
  } catch (error) { window.alert(error.message); }
}

function openEarning() {
  byId("earningAmount").value = ""; byId("earningNote").value = "";
  byId("earningMessage").textContent = state.operator ? "Record only verified amounts. The note is public ledger text; do not include sensitive information." : "Operator sign-in is required to record earnings.";
  byId("earningDialog").showModal();
}

async function recordEarning() {
  await requireOperator();
  const personaId = byId("earningPersona").value; const amount = Number(byId("earningAmount").value); const note = byId("earningNote").value.trim();
  if (!PERSONAS.some(persona => persona.id === personaId)) throw new Error("Choose a valid persona.");
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) throw new Error("Enter a verified positive USD amount.");
  if (!note || note.length > 240) throw new Error("Enter a public accounting note of 1–240 characters.");
  const entry = { id: crypto.randomUUID(), personaId, amount, currency: "USD", note, createdAt: now() };
  await fb.setDoc(fb.doc(window.quosDb, "browserWorkspace", "earnings", entry.id), { ...entry, operatorUid: state.user.uid, createdAt: fb.serverTimestamp() });
  state.browserEarnings.unshift(entry); renderActivity();
  byId("earningMessage").textContent = "Verified earning saved to the browser workspace ledger.";
  setTimeout(() => byId("earningDialog").close(), 800);
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
  await requireOperator();
  const persona = state.selectedPersona; const brief = byId("taskBrief").value.trim(); const key = byId("geminiKey").value.trim();
  if (!persona || !brief) throw new Error("Select a persona and enter a task brief.");
  if (!key) throw new Error("Enter a Gemini key for this browser session. It is not saved.");
  if (effectiveStatus(persona) === "paused") throw new Error(`${persona.id} is paused. Reactivate it before running a task.`);
  state.geminiKey = key; state.browserStatus.set(persona.id, "working"); renderBots(); await writeBrowserStatus(persona.id, "working");
  byId("dialogMessage").textContent = "Collecting browser-accessible public source links…";
  try {
    const sources = await browserSources(brief);
    byId("dialogMessage").textContent = "Generating a role-aware Gemini response in this browser tab…";
    const response = await browserGemini(persona, brief, sources, state.geminiKey);
    const completedAt = now();
    const task = { id: crypto.randomUUID(), personaId: persona.id, type: "browser_task", summary: brief, outcome: "completed", response, sourceCount: sources.length, createdAt: completedAt };
    const brainEntry = appendBrain({ type: "browser_task", personaId: persona.id, role: persona.role, task: brief, response, sources, scope: "private" });
    const syncError = await persistBrowserResult(task, brainEntry);
    state.localTasks.unshift(task); state.browserStatus.set(persona.id, "active"); await writeBrowserStatus(persona.id, "active"); renderBots(); renderActivity();
    byId("dialogMessage").textContent = syncError ? `Completed locally. Firebase needs the browser-workspace rules published before it can retain this result. ${syncError}` : `Completed and saved to Firebase with ${sources.length} source link(s). Download brain.jsonl to retain a portable audit trail.`;
  } catch (error) {
    state.browserStatus.set(persona.id, "attention"); appendBrain({ type: "browser_task_failure", personaId: persona.id, task: brief, summary: error.message, scope: "private" }); await writeBrowserStatus(persona.id, "attention"); renderBots();
    throw error;
  } finally { state.geminiKey = ""; byId("geminiKey").value = ""; }
}

async function beginGoogleSignIn() {
  try { byId("signIn").textContent = "Opening Google…"; await fb.signInWithRedirect(window.quosAuth, new fb.GoogleAuthProvider()); }
  catch (error) { console.warn("Firebase operator sign-in could not start:", error.message); byId("signIn").textContent = "Operator sign in"; byId("authMessage").textContent = "Google sign-in could not start. Confirm the authorized domain in Firebase Authentication."; }
}

async function beginEmailSignIn() {
  const email = byId("operatorEmail").value.trim(); const password = byId("operatorPassword").value;
  if (!email || !password) throw new Error("Enter the Email/Password operator credentials.");
  try {
    byId("authMessage").textContent = "Signing in…";
    await fb.signInWithEmailAndPassword(window.quosAuth, email, password);
    byId("operatorPassword").value = ""; authDialog.close();
  } catch (error) {
    byId("operatorPassword").value = "";
    console.warn("Firebase Email/Password sign-in failed:", error.code || error.message);
    throw new Error("Email/Password sign-in failed. Check the credentials created in Firebase Authentication.");
  }
}

byId("submitTask").addEventListener("click", async event => { event.preventDefault(); try { await runBrowserTask(); setTimeout(() => dialog.close(), 900); } catch (error) { byId("dialogMessage").textContent = error.message; } });
byId("brainExport").addEventListener("click", exportBrain);
byId("recordEarning").addEventListener("click", openEarning);
byId("submitEarning").addEventListener("click", async event => { event.preventDefault(); try { await recordEarning(); } catch (error) { byId("earningMessage").textContent = error.message; } });
byId("signIn").addEventListener("click", async () => { if (!configured) return window.alert("Set Firebase Web configuration in firebase-config.js first."); if (state.user) return fb.signOut(window.quosAuth); byId("operatorEmail").value = ""; byId("operatorPassword").value = ""; byId("authMessage").textContent = "Choose Google or the Email/Password user created in Firebase Authentication. Credentials are never saved."; authDialog.showModal(); });
byId("googleSignIn").addEventListener("click", async event => { event.preventDefault(); await beginGoogleSignIn(); });
byId("emailSignIn").addEventListener("click", async event => { event.preventDefault(); try { await beginEmailSignIn(); } catch (error) { byId("authMessage").textContent = error.message; } });
search.addEventListener("input", renderBots); groupFilter.addEventListener("change", renderBots);

function bindSnapshot(source, callback) { fb.onSnapshot(source, snapshot => { byId("connection").textContent = "FIREBASE LIVE"; callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); }, error => { byId("connection").textContent = "FIREBASE READ BLOCKED"; console.warn("Firestore read blocked:", error.message); }); }

loadBrain(); byId("brainCount").textContent = `${state.brain.length} local records`;
if (configured) {
  byId("connection").textContent = "FIREBASE CONNECTING";
  const [appSdk, authSdk, firestoreSdk] = await Promise.all([import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js"), import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js"), import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js")]);
  fb = { ...appSdk, ...authSdk, ...firestoreSdk }; const app = fb.initializeApp(firebaseConfig); const db = fb.getFirestore(app); const auth = fb.getAuth(app); window.quosDb = db; window.quosAuth = auth;
  fb.getRedirectResult(auth).catch(error => console.warn("Firebase operator redirect failed:", error.message));
  bindSnapshot(fb.collection(db, "quosBots", "runtimeState", "botProfiles"), rows => { state.profiles = new Map(rows.map(row => [row.id, row])); renderBots(); });
  bindSnapshot(fb.query(fb.collection(db, "quosBots", "runtimeState", "publicTasks"), fb.orderBy("createdAt", "desc"), fb.limit(50)), rows => { state.tasks = rows; renderActivity(); });
  bindSnapshot(fb.query(fb.collection(db, "quosBots", "runtimeState", "publicEarnings"), fb.orderBy("createdAt", "desc"), fb.limit(50)), rows => { state.earnings = rows; renderActivity(); });
  bindSnapshot(fb.query(fb.collection(db, "browserWorkspace", "earnings"), fb.orderBy("createdAt", "desc"), fb.limit(50)), rows => { state.browserEarnings = rows; renderActivity(); });
  bindSnapshot(fb.query(fb.collection(db, "browserWorkspace", "tasks"), fb.orderBy("createdAt", "desc"), fb.limit(50)), rows => { state.workspaceTasks = rows; renderActivity(); });
  bindSnapshot(fb.collection(db, "browserWorkspace", "botStatuses"), rows => { rows.forEach(row => state.browserStatus.set(row.personaId, row.status)); renderBots(); });
  bindSnapshot(fb.collection(db, "dashboardControls"), rows => { state.controls = new Map(rows.map(row => [row.personaId, row])); renderBots(); });
  fb.onSnapshot(fb.doc(db, "quosBots", "runtimeState"), snapshot => setGateway(snapshot.data()?.metadata || {}));
  fb.onAuthStateChanged(auth, async user => { state.user = user; state.operator = false; byId("signIn").textContent = user ? "Checking operator…" : "Operator sign in"; if (user) { const admin = await fb.getDoc(fb.doc(db, "dashboardOperators", user.uid)); state.operator = admin.exists() && admin.data()?.enabled === true; byId("signIn").textContent = state.operator ? "Operator sign out" : "Signed in · view only"; } });
} else { byId("connection").textContent = "FIREBASE CONFIG REQUIRED"; byId("metricGateway").textContent = "browser only"; renderBots(); renderActivity(); }
