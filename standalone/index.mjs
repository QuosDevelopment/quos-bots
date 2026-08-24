import http from "node:http";
import { readFile } from "node:fs/promises";
import { ChannelType, Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import cron from "node-cron";
import { PERSONAS, PERSONA_BY_ID } from "./personas.mjs";
import { answerPersona, researchPersona } from "./research.mjs";
import { runTerryLearningCycles, recentMemoryContext } from "./terry.mjs";
import { appendBounded, appendBrainMemory, ensureBotProfiles, fetchDashboardControls, fetchQueuedDashboardTasks, loadState, markDashboardTask, recordEarning, recordTask, saveState } from "./state.mjs";

const required = ["DISCORD_BOT_TOKEN", "DISCORD_APPLICATION_ID", "DISCORD_GUILD_ID", "PORT"];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required. Copy .env.example to .env and set it before starting.`);

let state = await loadState();
ensureBotProfiles(state, PERSONAS);
await saveState(state);
let dashboardControls = new Map();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commandBuilders = [
  new SlashCommandBuilder().setName("qb").setDescription("Ask the persona assigned to this channel.").addStringOption(option => option.setName("prompt").setDescription("Question or task").setRequired(true)),
  new SlashCommandBuilder().setName("research").setDescription("Create a cited public-source research draft.").addStringOption(option => option.setName("question").setDescription("Research question").setRequired(true)),
  new SlashCommandBuilder().setName("knowledge").setDescription("Retrieve published shared knowledge.").addStringOption(option => option.setName("query").setDescription("Optional search words")),
  new SlashCommandBuilder().setName("status").setDescription("Show the scoped persona and operations status."),
  new SlashCommandBuilder().setName("report").setDescription("Send an escalation to QB-000.").addStringOption(option => option.setName("note").setDescription("Issue or decision needed").setRequired(true)),
  new SlashCommandBuilder().setName("vet").setDescription("QB-000: publish a cited research draft.").addStringOption(option => option.setName("research_id").setDescription("Research draft ID").setRequired(true)),
  new SlashCommandBuilder().setName("earning").setDescription("QB-000: record a verified persona earning.").addStringOption(option => option.setName("persona_id").setDescription("Persona ID, such as QB-015").setRequired(true)).addNumberOption(option => option.setName("amount").setDescription("Verified amount").setRequired(true)).addStringOption(option => option.setName("note").setDescription("Source or accounting note").setRequired(true)),
].map(command => command.toJSON());

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const channelToPersona = channelId => Object.entries(state.channels).find(([, id]) => id === channelId)?.[0];

function basicAuthorised(req) {
  const expected = Buffer.from(`${process.env.DASHBOARD_USERNAME}:${process.env.DASHBOARD_PASSWORD}`).toString("base64");
  return Boolean(process.env.DASHBOARD_USERNAME && process.env.DASHBOARD_PASSWORD && req.headers.authorization === `Basic ${expected}`);
}

async function writeReport(report) {
  appendBounded(state.reports, { id: crypto.randomUUID(), targetPersonaId: "QB-000", createdAt: new Date().toISOString(), ...report });
  await saveState(state);
  const qb000ChannelId = state.channels["QB-000"];
  const channel = qb000ChannelId ? await client.channels.fetch(qb000ChannelId).catch(() => null) : null;
  if (channel?.isTextBased()) {
    const message = `**${report.kind.toUpperCase()} — ${report.personaId}**\n${report.summary}`;
    await channel.send(message.length > 1900 ? `${message.slice(0, 1896)}…` : message);
  }
}

async function recordResearch(persona, question, scheduled = false) {
  const result = await researchPersona(persona, question);
  appendBounded(state.knowledge, result);
  await appendBrainMemory(state, { type: "research", personaId: persona.id, question, summary: result.summary, sources: result.sources, scope: "private", createdAt: result.createdAt });
  appendBounded(state.runs, { id: result.id, personaId: persona.id, question, scheduled, status: "completed", createdAt: result.createdAt });
  recordTask(state, persona, scheduled ? "scheduled_research" : "research", "completed", question);
  await writeReport({ personaId: persona.id, kind: "research", severity: result.sources.length >= 2 ? "info" : "watch", summary: `${result.summary}\nSources: ${result.sources.map(source => source.url).join(" | ") || "none"}` });
  return result;
}

async function executePersonaTask(persona, task, origin) {
  recordTask(state, persona, origin, "working", task);
  await saveState(state);
  try {
    const learning = await runTerryLearningCycles({ persona, task, memory: state.brain });
    for (const cycle of learning.cycles) await appendBrainMemory(state, cycle);
    const knowledge = {
      id: learning.id,
      personaId: persona.id,
      role: persona.role,
      question: task,
      summary: learning.response,
      sources: learning.sources,
      status: "published",
      coordinatorId: "QB-000",
      vettedAt: learning.createdAt,
      automatedReview: "Terry/QB-000 published a source-attributed task result after five bounded learning cycles.",
      createdAt: learning.createdAt,
    };
    appendBounded(state.knowledge, knowledge);
    await appendBrainMemory(state, { type: "task_completion", personaId: persona.id, coordinatorId: "QB-000", task, summary: learning.response, sources: learning.sources, scope: "shared", cycleCount: learning.cycleCount, createdAt: learning.createdAt });
    recordTask(state, persona, origin, "completed", task);
    await writeReport({ personaId: persona.id, kind: "task_completion", severity: learning.sources.length ? "info" : "watch", summary: `Terry completed ${learning.cycleCount} bounded learning cycles for: ${task}\n${learning.response}\nSources: ${learning.sources.map(source => source.url).join(" | ") || "none"}` });
    await saveState(state);
    return learning;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown error";
    await appendBrainMemory(state, { type: "task_failure", personaId: persona.id, coordinatorId: "QB-000", task, summary: detail, scope: "private" });
    recordTask(state, persona, origin, "failed", task);
    await writeReport({ personaId: persona.id, kind: "escalation", severity: "watch", summary: `Terry could not complete task: ${task}\nReason: ${detail}` });
    await saveState(state);
    throw error;
  }
}

async function runScheduledResearch() {
  const count = Math.max(1, Number(process.env.RESEARCH_MAX_PERSONAS_PER_RUN || "1"));
  for (let index = 0; index < count; index += 1) {
    const persona = PERSONAS[state.nextPersonaIndex % PERSONAS.length] || PERSONAS[1];
    state.nextPersonaIndex = (state.nextPersonaIndex + 1) % PERSONAS.length;
    if (persona.id === "QB-000") continue;
    try {
      await recordResearch(persona, `Current public developments, practices, and evidence relevant to the ${persona.role} role.`, true);
    } catch (error) {
      await writeReport({ personaId: persona.id, kind: "escalation", severity: "watch", summary: `Scheduled research failed: ${error instanceof Error ? error.message : "unknown error"}` });
    }
  }
  await saveState(state);
}

async function refreshDashboardControlPlane() {
  dashboardControls = await fetchDashboardControls();
  const tasks = await fetchQueuedDashboardTasks();
  for (const task of tasks) {
    const persona = PERSONA_BY_ID.get(task.personaId);
    if (!persona || persona.id === "QB-000") {
      await markDashboardTask(task.id, "rejected", "Unknown or coordinator persona ID.");
      continue;
    }
    if (dashboardControls.get(persona.id)?.status === "paused") {
      await markDashboardTask(task.id, "deferred", `${persona.id} is paused by the dashboard operator.`);
      continue;
    }
    await markDashboardTask(task.id, "working", "Terry/QB-000 started five bounded Gemini learning cycles with cited public-source collection.");
    const channelId = state.channels[persona.id];
    const channel = channelId ? await client.channels.fetch(channelId).catch(() => null) : null;
    if (channel?.isTextBased()) await channel.send(`**Dashboard task started**\n${task.brief}\n\nTerry/QB-000 is running five bounded learning cycles with cited public-source collection.`);
    try {
      const result = await executePersonaTask(persona, task.brief, "dashboard_assignment");
      if (channel?.isTextBased()) await channel.send(`**Dashboard task completed**\n${result.response}\n\nSources:\n${result.sources.slice(0, 5).map((source, index) => `[${index + 1}] ${source.title}\n${source.url}`).join("\n") || "No public sources returned."}`);
      await markDashboardTask(task.id, "completed", `Completed ${result.cycleCount} bounded learning cycles; cited result was published to shared QUOS knowledge and reported to QB-000.`);
    } catch (error) {
      await markDashboardTask(task.id, "failed", error instanceof Error ? error.message : "Unknown runtime failure.");
    }
  }
  await saveState(state);
}

async function ensureChannels() {
  const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
  const categories = new Map();
  for (const persona of PERSONAS) {
    const categoryName = `QUOS · ${persona.group}`;
    let category = categories.get(categoryName) || guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name === categoryName);
    if (!category) {
      category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });
      await sleep(700);
    }
    categories.set(categoryName, category);
    if (state.channels[persona.id]) continue;
    const existing = guild.channels.cache.find(channel => channel.type === ChannelType.GuildText && channel.name === persona.channelSlug);
    const channel = existing || await guild.channels.create({
      name: persona.channelSlug,
      type: ChannelType.GuildText,
      parent: category.id,
      topic: `${persona.id} — ${persona.role}. Use /qb, /research, /knowledge, /status, /report.`,
    });
    state.channels[persona.id] = channel.id;
    await sleep(700);
  }
  await saveState(state);
}

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(process.env.DISCORD_APPLICATION_ID, process.env.DISCORD_GUILD_ID), { body: commandBuilders });
}

async function reply(interaction, content) {
  const safe = content.length > 1900 ? `${content.slice(0, 1896)}…` : content;
  return interaction.deferred ? interaction.editReply(safe) : interaction.reply(safe);
}

client.once(Events.ClientReady, async ready => {
  console.log(`QUOS Bots connected as ${ready.user.tag}`);
  state.health = { gateway: "connected", lastGatewayEventAt: new Date().toISOString() };
  await saveState(state);
  await registerCommands();
  await refreshDashboardControlPlane().catch(error => console.warn("Dashboard control plane unavailable:", error.message));
  if (process.argv.includes("--bootstrap-only")) {
    await ensureChannels();
    console.log("Channel bootstrap completed.");
    process.exit(0);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || interaction.guildId !== process.env.DISCORD_GUILD_ID) return;
  await interaction.deferReply();
  const personaId = channelToPersona(interaction.channelId);
  const persona = personaId ? PERSONA_BY_ID.get(personaId) : null;
  if (!persona) return reply(interaction, "This command must be run inside a provisioned QUOS persona channel.");
  if (persona.id !== "QB-000" && dashboardControls.get(persona.id)?.status === "paused") return reply(interaction, `${persona.id} is paused by an authenticated dashboard operator. QB-000 can reactivate it from the GitHub Pages dashboard.`);

  if (interaction.commandName === "status") return reply(interaction, `**${persona.id} — ${persona.role}**\nChannel: #${persona.channelSlug}\nKnowledge: ${state.knowledge.filter(item => item.personaId === persona.id).length} drafts / publications.`);
  if (interaction.commandName === "qb") {
    const prompt = interaction.options.getString("prompt", true);
    const answer = await answerPersona(persona, prompt, recentMemoryContext(state.brain, persona.id));
    await appendBrainMemory(state, { type: "conversation", personaId: persona.id, prompt, summary: answer, scope: "private" });
    recordTask(state, persona, "persona_answer", "completed", prompt);
    await writeReport({ personaId: persona.id, kind: "activity", severity: "info", summary: `Responded to a /qb request in #${persona.channelSlug}.` });
    await saveState(state);
    return reply(interaction, `**${persona.id} — ${persona.role}**\n${answer}`);
  }
  if (interaction.commandName === "research") {
    const result = await recordResearch(persona, interaction.options.getString("question", true));
    return reply(interaction, `**${persona.id} research draft**\n${result.summary}\n\n${result.sources.map((source, index) => `[${index + 1}] ${source.title}\n${source.url}`).join("\n") || "No public sources returned."}`);
  }
  if (interaction.commandName === "knowledge") {
    const query = (interaction.options.getString("query") || "").toLowerCase();
    const matches = state.knowledge.filter(item => item.status === "published" && `${item.summary} ${item.question}`.toLowerCase().includes(query)).slice(0, 5);
    return reply(interaction, matches.length ? matches.map(item => `**${item.personaId}** — ${item.summary}\n${item.sources[0]?.url || "No source URL"}`).join("\n\n") : "No published shared knowledge matched. QB-000 can publish a cited research draft using /vet in the coordinator channel.");
  }
  if (interaction.commandName === "report") {
    recordTask(state, persona, "escalation", "completed", interaction.options.getString("note", true));
    await writeReport({ personaId: persona.id, kind: "escalation", severity: "watch", summary: interaction.options.getString("note", true) });
    return reply(interaction, `QB-000 received the report from ${persona.id}.`);
  }
  if (interaction.commandName === "vet") {
    if (persona.id !== "QB-000") return reply(interaction, "Only QB-000 can vet and publish shared knowledge.");
    const item = state.knowledge.find(knowledge => knowledge.id === interaction.options.getString("research_id", true));
    if (!item) return reply(interaction, "Research draft not found.");
    if (!item.sources.length) return reply(interaction, "A source-free draft cannot be published.");
    item.status = "published";
    item.vettedAt = new Date().toISOString();
    recordTask(state, persona, "knowledge_vetting", "completed", item.id);
    await saveState(state);
    return reply(interaction, `Published **${item.id}** to shared knowledge with ${item.sources.length} cited public source(s).`);
  }
  if (interaction.commandName === "earning") {
    if (persona.id !== "QB-000") return reply(interaction, "Only QB-000 can record earnings.");
    const target = PERSONA_BY_ID.get(interaction.options.getString("persona_id", true)?.toUpperCase());
    const amount = interaction.options.getNumber("amount", true);
    if (!target || target.id === "QB-000" || amount <= 0) return reply(interaction, "Provide a valid non-coordinator persona ID and a positive verified amount.");
    const entry = recordEarning(state, target, amount, "USD", interaction.options.getString("note", true));
    recordTask(state, persona, "earning_record", "completed", `${entry.personaId}: $${entry.amount}`);
    await writeReport({ personaId: persona.id, kind: "activity", severity: "info", summary: `Recorded verified earnings for ${entry.personaId}: $${entry.amount.toFixed(2)} USD.` });
    return reply(interaction, `Recorded $${entry.amount.toFixed(2)} USD for ${entry.personaId}.`);
  }
});

const dashboardHtml = await readFile(new URL("./public/index.html", import.meta.url), "utf8");
http.createServer((req, res) => {
  if (!basicAuthorised(req)) {
    res.writeHead(401, { "www-authenticate": "Basic realm=QUOS-Bots", "content-type": "text/plain" });
    return res.end("Operator authentication required.");
  }
  if (req.url === "/api/status") {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify({
      gateway: client.isReady() ? "connected" : "connecting",
      personas: PERSONAS.length - 1,
      coordinator: "QB-000",
      channels: Object.keys(state.channels).length,
      bots: Object.values(state.botProfiles).sort((left, right) => left.id.localeCompare(right.id)),
      knowledge: state.knowledge.length,
      publishedKnowledge: state.knowledge.filter(item => item.status === "published").length,
      brainRecords: state.brain.length,
      reports: state.reports.slice(0, 8),
      taskHistory: state.tasks.slice(0, 25),
      earnings: { currency: "USD", total: state.earnings.reduce((sum, entry) => sum + (entry.currency === "USD" ? entry.amount : 0), 0), entries: state.earnings.slice(0, 25) },
      runs: state.runs.slice(0, 8),
      freeTierNotice: "This process responds and schedules research only while the host is awake.",
    }));
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(dashboardHtml);
}).listen(Number(process.env.PORT), () => console.log(`QUOS status console listening on configured port ${process.env.PORT}`));

await client.login(process.env.DISCORD_BOT_TOKEN);
if (process.env.SCHEDULE_ENABLED !== "false") {
  const expression = process.env.RESEARCH_CRON || "0 9 * * *";
  if (!cron.validate(expression)) throw new Error(`Invalid RESEARCH_CRON: ${expression}`);
  cron.schedule(expression, () => void runScheduledResearch(), { timezone: "UTC", noOverlap: true });
  console.log(`Automatic research scheduled: ${expression} UTC (runs only while the process is awake).`);
}
setInterval(() => void refreshDashboardControlPlane().catch(error => console.warn("Dashboard control refresh failed:", error.message)), 60_000);
