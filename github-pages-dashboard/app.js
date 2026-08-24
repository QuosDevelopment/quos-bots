import { firebaseConfig } from "./firebase-config.js";
import { PERSONAS } from "./personas.js";

const configured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("REPLACE_");
const state = { profiles: new Map(), tasks: [], earnings: [], controls: new Map(), user: null, operator: false, selectedPersona: null };
let fb = {};
const byId = id => document.getElementById(id);
const formatDate = value => value ? new Date(value?.toDate?.() || value).toLocaleString() : "—";
const formatMoney = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value) || 0);
const escape = value => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" }[char]));

const grid = byId("botGrid"); const cardTemplate = byId("botCard"); const dialog = byId("taskDialog"); const search = byId("search"); const groupFilter = byId("groupFilter");

for (const group of [...new Set(PERSONAS.map(persona => persona.group))].sort()) groupFilter.insertAdjacentHTML("beforeend", `<option value="${escape(group)}">${escape(group)}</option>`);

function effectiveStatus(persona) {
  const control = state.controls.get(persona.id);
  if (control?.status === "paused") return "paused";
  return state.profiles.get(persona.id)?.operationalStatus || "unreported";
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
  byId("metricTasks").textContent = state.tasks.length;
  byId("taskCount").textContent = `${state.tasks.length} records`;
  byId("taskRows").innerHTML = state.tasks.length ? state.tasks.map(task => `<tr><td>${formatDate(task.createdAt)}</td><td>${escape(task.personaId)}</td><td>${escape(task.type || task.summary)}</td><td>${escape(task.outcome || task.status || "queued")}</td></tr>`).join("") : "<tr><td colspan=\"4\">No task history was returned.</td></tr>";
  const total = state.earnings.reduce((sum, entry) => sum + (entry.currency === "USD" ? Number(entry.amount) || 0 : 0), 0);
  byId("metricEarnings").textContent = formatMoney(total);
  byId("earningRows").innerHTML = state.earnings.length ? state.earnings.map(entry => `<tr><td>${formatDate(entry.createdAt)}</td><td>${escape(entry.personaId)}</td><td>${formatMoney(entry.amount)}</td><td>${escape(entry.note)}</td></tr>`).join("") : "<tr><td colspan=\"4\">No verified ledger entries.</td></tr>";
}

function setGateway(metadata = {}) { byId("metricGateway").textContent = metadata.gateway || "unknown"; byId("metricUpdated").textContent = metadata.lastGatewayEventAt ? `updated ${formatDate(metadata.lastGatewayEventAt)}` : "No recent runtime signal"; }

function openAssign(persona) { state.selectedPersona = persona; byId("dialogTitle").textContent = `ASSIGN ${persona.id}`; byId("dialogPersona").textContent = `${persona.role} · ${persona.group}`; byId("taskBrief").value = ""; byId("dialogMessage").textContent = state.operator ? "This queues a task record for the Replit runtime; it does not execute browser-side." : "Operator sign-in is required to queue tasks."; dialog.showModal(); }

async function requireOperator() { if (!configured) throw new Error("Firebase web configuration is not set."); if (!state.operator) throw new Error("Operator sign-in and Firebase operator authorization are required."); }

async function togglePause(persona) { try { await requireOperator(); const current = state.controls.get(persona.id); const status = current?.status === "paused" ? "active" : "paused"; const action = status === "paused" ? "pause" : "reactivate"; if (!window.confirm(`${action === "pause" ? "Kill bot" : "Reactivate bot"} ${persona.id}? “Kill bot” is a reversible pause: it blocks new Discord commands for this persona but does not delete its data or stop the shared application.`)) return; const db = window.quosDb; await fb.setDoc(fb.doc(db, "dashboardControls", persona.id), { personaId: persona.id, status, operatorUid: state.user.uid, updatedAt: fb.serverTimestamp() }, { merge: true }); } catch (error) { window.alert(error.message); } }

byId("submitTask").addEventListener("click", async event => { event.preventDefault(); try { await requireOperator(); const brief = byId("taskBrief").value.trim(); if (!brief) throw new Error("Enter a task brief."); await fb.addDoc(fb.collection(window.quosDb, "dashboardTasks"), { personaId: state.selectedPersona.id, brief, status: "queued", operatorUid: state.user.uid, createdAt: fb.serverTimestamp() }); byId("dialogMessage").textContent = "Task queued for the runtime to collect."; setTimeout(() => dialog.close(), 700); } catch (error) { byId("dialogMessage").textContent = error.message; } });

search.addEventListener("input", renderBots); groupFilter.addEventListener("change", renderBots); byId("signIn").addEventListener("click", async () => { if (!configured) return window.alert("Set Firebase Web configuration in firebase-config.js first."); if (state.user) return fb.signOut(window.quosAuth); try { byId("signIn").textContent = "Opening Google…"; await fb.signInWithRedirect(window.quosAuth, new fb.GoogleAuthProvider()); } catch (error) { console.warn("Firebase operator sign-in could not start:", error.message); byId("signIn").textContent = "Operator sign in"; window.alert("Google sign-in could not start. Confirm that this dashboard domain is authorized in Firebase Authentication."); } });

function bindSnapshot(source, callback) { fb.onSnapshot(source, snapshot => { byId("connection").textContent = "FIREBASE LIVE"; callback(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))); }, error => { byId("connection").textContent = "FIREBASE READ BLOCKED"; console.warn("Firestore read blocked:", error.message); }); }

if (configured) {
  byId("connection").textContent = "FIREBASE CONNECTING";
  const [appSdk, authSdk, firestoreSdk] = await Promise.all([import("https://www.gstatic.com/firebasejs/12.8.0/firebase-app.js"), import("https://www.gstatic.com/firebasejs/12.8.0/firebase-auth.js"), import("https://www.gstatic.com/firebasejs/12.8.0/firebase-firestore.js")]);
  fb = { ...appSdk, ...authSdk, ...firestoreSdk }; const app = fb.initializeApp(firebaseConfig); const db = fb.getFirestore(app); const auth = fb.getAuth(app); window.quosDb = db; window.quosAuth = auth;
  fb.getRedirectResult(auth).catch(error => { console.warn("Firebase operator redirect failed:", error.message); });
  bindSnapshot(fb.collection(db, "quosBots", "runtimeState", "botProfiles"), rows => { state.profiles = new Map(rows.map(row => [row.id, row])); renderBots(); });
  bindSnapshot(fb.query(fb.collection(db, "quosBots", "runtimeState", "publicTasks"), fb.orderBy("createdAt", "desc"), fb.limit(50)), rows => { state.tasks = rows; renderActivity(); });
  bindSnapshot(fb.query(fb.collection(db, "quosBots", "runtimeState", "publicEarnings"), fb.orderBy("createdAt", "desc"), fb.limit(50)), rows => { state.earnings = rows; renderActivity(); });
  bindSnapshot(fb.collection(db, "dashboardControls"), rows => { state.controls = new Map(rows.map(row => [row.personaId, row])); renderBots(); });
  fb.onSnapshot(fb.doc(db, "quosBots", "runtimeState"), snapshot => setGateway(snapshot.data()?.metadata || {}));
  fb.onAuthStateChanged(auth, async user => { state.user = user; state.operator = false; byId("signIn").textContent = user ? "Checking operator…" : "Operator sign in"; if (user) { const admin = await fb.getDoc(fb.doc(db, "dashboardOperators", user.uid)); state.operator = admin.exists() && admin.data()?.enabled === true; byId("signIn").textContent = state.operator ? "Operator sign out" : "Signed in · view only"; } });
} else { byId("connection").textContent = "FIREBASE CONFIG REQUIRED"; byId("metricGateway").textContent = "unconfigured"; renderBots(); renderActivity(); }
