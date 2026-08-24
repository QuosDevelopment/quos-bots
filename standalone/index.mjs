import http from "node:http";
import { readFile } from "node:fs/promises";
import { ChannelType, Client, Events, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import cron from "node-cron";
import { PERSONAS, PERSONA_BY_ID } from "./personas.mjs";
import { answerPersona, researchPersona } from "./research.mjs";
import { appendBounded, loadState, saveState } from "./state.mjs";

const required = ["DISCORD_BOT_TOKEN", "DISCORD_APPLICATION_ID", "DISCORD_GUILD_ID", "PORT"];
for (const key of required) if (!process.env[key]) throw new Error(`${key} is required. Copy .env.example to .env and set it before starting.`);

let state = await loadState();
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const commandBuilders = [
  new SlashCommandBuilder().setName("qb").setDescription("Ask the persona assigned to this channel.").addStringOption(option => option.setName("prompt").setDescription("Question or task").setRequired(true)),
  new SlashCommandBuilder().setName("research").setDescription("Create a cited public-source research draft.").addStringOption(option => option.setName("question").setDescription("Research question").setRequired(true)),
  new SlashCommandBuilder().setName("knowledge").setDescription("Retrieve published shared knowledge.").addStringOption(option => option.setName("query").setDescription("Optional search words")),
  new SlashCommandBuilder().setName("status").setDescription("Show the scoped persona and operations status."),
  new SlashCommandBuilder().setName("report").setDescription("Send an escalation to QB-000.").addStringOption(option => option.setName("note").setDescription("Issue or decision needed").setRequired(true)),
  new SlashCommandBuilder().setName("vet").setDescription("QB-000: publish a cited research draft.").addStringOption(option => option.setName("research_id").setDescription("Research draft ID").setRequired(true)),
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
  if (channel?.isTextBased()) await channel.send(`**${report.kind.toUpperCase()} — ${report.personaId}**\n${report.summary}`);
}

async function recordResearch(persona, question, scheduled = false) {
  const result = await researchPersona(persona, question);
  appendBounded(state.knowledge, result);
  appendBounded(state.runs, { id: result.id, personaId: persona.id, question, scheduled, status: "completed", createdAt: result.createdAt });
  await writeReport({ personaId: persona.id, kind: "research", severity: result.sources.length >= 2 ? "info" : "watch", summary: `${result.summary}\nSources: ${result.sources.map(source => source.url).join(" | ") || "none"}` });
  return result;
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
  await registerCommands();
  if (process.argv.includes("--bootstrap-only")) {
    await ensureChannels();
    console.log("Channel bootstrap completed.");
    process.exit(0);
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand() || interaction.guildId !== process.env.DISCORD_GUILD_ID) return;
  const personaId = channelToPersona(interaction.channelId);
  const persona = personaId ? PERSONA_BY_ID.get(personaId) : null;
  if (!persona) return reply(interaction, "This command must be run inside a provisioned QUOS persona channel.");

  if (interaction.commandName === "status") return reply(interaction, `**${persona.id} — ${persona.role}**\nChannel: #${persona.channelSlug}\nKnowledge: ${state.knowledge.filter(item => item.personaId === persona.id).length} drafts / publications.`);
  if (interaction.commandName === "qb") {
    await interaction.deferReply();
    const answer = await answerPersona(persona, interaction.options.getString("prompt", true));
    await writeReport({ personaId: persona.id, kind: "activity", severity: "info", summary: `Responded to a /qb request in #${persona.channelSlug}.` });
    return reply(interaction, `**${persona.id} — ${persona.role}**\n${answer}`);
  }
  if (interaction.commandName === "research") {
    await interaction.deferReply();
    const result = await recordResearch(persona, interaction.options.getString("question", true));
    return reply(interaction, `**${persona.id} research draft**\n${result.summary}\n\n${result.sources.map((source, index) => `[${index + 1}] ${source.title}\n${source.url}`).join("\n") || "No public sources returned."}`);
  }
  if (interaction.commandName === "knowledge") {
    const query = (interaction.options.getString("query") || "").toLowerCase();
    const matches = state.knowledge.filter(item => item.status === "published" && `${item.summary} ${item.question}`.toLowerCase().includes(query)).slice(0, 5);
    return reply(interaction, matches.length ? matches.map(item => `**${item.personaId}** — ${item.summary}\n${item.sources[0]?.url || "No source URL"}`).join("\n\n") : "No published shared knowledge matched. QB-000 can publish a cited research draft using /vet in the coordinator channel.");
  }
  if (interaction.commandName === "report") {
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
    await saveState(state);
    return reply(interaction, `Published **${item.id}** to shared knowledge with ${item.sources.length} cited public source(s).`);
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
      knowledge: state.knowledge.length,
      publishedKnowledge: state.knowledge.filter(item => item.status === "published").length,
      reports: state.reports.slice(0, 8),
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
