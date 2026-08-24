import {
  ChannelType,
  ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  Guild,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { eq } from "drizzle-orm";
import { channelProvisioning, personas } from "../drizzle/schema";
import { PERSONA_BY_ID, QB000 } from "../shared/personas";
import { getDb, recordReport, retrieveSharedKnowledge, updateChannelProvisioning, updateDiscordConfiguration } from "./db";
import { buildChannelProvisioningPlan, formatKnowledgeAttribution, resolvePersonaCommandRoute } from "./domainContracts";
import { answerAsPersona, runGroundedResearch } from "./research";

let client: Client | undefined;
let startPromise: Promise<void> | undefined;

const commands = [
  new SlashCommandBuilder()
    .setName("qb")
    .setDescription("Ask the persona assigned to this QUOS channel.")
    .addStringOption(option => option.setName("prompt").setDescription("The task or question").setRequired(true)),
  new SlashCommandBuilder()
    .setName("research")
    .setDescription("Create a source-grounded research draft for the persona assigned to this channel.")
    .addStringOption(option => option.setName("question").setDescription("Research question").setRequired(true)),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show this persona’s role, scoped commands, and knowledge status."),
  new SlashCommandBuilder()
    .setName("knowledge")
    .setDescription("Retrieve published shared knowledge with attribution.")
    .addStringOption(option => option.setName("query").setDescription("Optional keyword or phrase")),
  new SlashCommandBuilder()
    .setName("report")
    .setDescription("Escalate a structured note to QB-000.")
    .addStringOption(option => option.setName("note").setDescription("Issue, blocker, or decision needed").setRequired(true))
    .addStringOption(option => option.setName("severity").setDescription("Escalation severity").addChoices(
      { name: "Info", value: "info" },
      { name: "Watch", value: "watch" },
      { name: "High", value: "high" },
      { name: "Critical", value: "critical" },
    )),
].map(command => command.toJSON());

function discordEnvironment() {
  return {
    token: process.env.DISCORD_BOT_TOKEN,
    guildId: process.env.DISCORD_GUILD_ID,
    applicationId: process.env.DISCORD_APPLICATION_ID,
  };
}

export function getDiscordRuntimeStatus() {
  const { token, guildId, applicationId } = discordEnvironment();
  return {
    configured: Boolean(token && guildId && applicationId),
    connected: Boolean(client?.isReady()),
    guildIdConfigured: Boolean(guildId),
    applicationIdConfigured: Boolean(applicationId),
  };
}

async function personaForChannel(channelId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(personas).where(eq(personas.channelId, channelId)).limit(1);
  return rows[0];
}

async function respond(interaction: ChatInputCommandInteraction, content: string) {
  const safe = content.length > 1900 ? `${content.slice(0, 1896)}…` : content;
  if (interaction.deferred || interaction.replied) return interaction.editReply(safe);
  return interaction.reply({ content: safe, ephemeral: false });
}

async function handleInteraction(interaction: ChatInputCommandInteraction) {
  const { guildId } = discordEnvironment();
  if (!guildId || interaction.guildId !== guildId) return;
  await interaction.deferReply();
  try {
    const persona = await personaForChannel(interaction.channelId);
    const route = resolvePersonaCommandRoute({
      interactionGuildId: interaction.guildId,
      configuredGuildId: guildId,
      channelPersonaId: persona?.id,
    });
    if (!route.allowed) {
      await respond(interaction, "This command is scoped to a provisioned QUOS persona channel. Use the QB-000 channel or a persona channel.");
      return;
    }
    if (!persona) return;

    if (interaction.commandName === "status") {
      const commands = JSON.parse(persona.commandsJson) as string[];
      await respond(interaction, `**${persona.id} — ${persona.role}**\nStatus: ${persona.status}\nScoped commands: ${commands.join(", ")}`);
      return;
    }

    if (interaction.commandName === "knowledge") {
      const results = await retrieveSharedKnowledge(persona.id, interaction.options.getString("query") ?? "");
      if (results.length === 0) {
        await respond(interaction, "No published shared knowledge matched this request. Run /research to create a draft, then have QB-000 vet its sources and publish it.");
        return;
      }
      const content = results.map(item => formatKnowledgeAttribution(item)).join("\n\n");
      await respond(interaction, content);
      return;
    }

    if (interaction.commandName === "qb") {
      const answer = await answerAsPersona(persona.id, interaction.options.getString("prompt", true));
      await respond(interaction, `**${persona.id} — ${persona.role}**\n${answer}`);
      return;
    }

    if (interaction.commandName === "research") {
      const result = await runGroundedResearch(persona.id, interaction.options.getString("question", true));
      await respond(interaction, `**${persona.id} research draft**\n${result.summary}\n\nSources awaiting QB-000 vetting:\n${result.sources.map(source => `• ${source.title} — ${source.url}`).join("\n") || "No usable sources returned."}`);
      return;
    }

    if (interaction.commandName === "report") {
      const severity = (interaction.options.getString("severity") ?? "info") as "info" | "watch" | "high" | "critical";
      const note = interaction.options.getString("note", true);
      await recordReport({
        personaId: persona.id,
        kind: "escalation",
        severity,
        title: `Discord escalation — ${persona.id}`,
        summary: note,
        payload: { channelId: interaction.channelId, submittedBy: interaction.user.id },
      });
      await respond(interaction, `QB-000 received this ${severity} report from ${persona.id}.`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    console.error("[Discord] Interaction handling failed:", error);
    try {
      await respond(interaction, `QB-000 recorded a command issue: ${message}`);
    } catch (responseError) {
      console.error("[Discord] Interaction error response failed:", responseError);
    }
  }
}

async function syncCommands() {
  const { applicationId, guildId, token } = discordEnvironment();
  if (!applicationId || !guildId || !token) throw new Error("Discord credentials are incomplete.");
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body: commands });
  await updateDiscordConfiguration({ lastCommandSyncAt: new Date() });
}

async function connectDiscord() {
  const { token, guildId, applicationId } = discordEnvironment();
  if (!token || !guildId || !applicationId) {
    await updateDiscordConfiguration({ gatewayStatus: "not_configured" });
    return;
  }
  if (client?.isReady()) return;

  await updateDiscordConfiguration({ guildId, applicationId, gatewayStatus: "connecting", lastError: null });
  client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.once(Events.ClientReady, async readyClient => {
    try {
      await syncCommands();
      await updateDiscordConfiguration({
        gatewayStatus: "connected",
        lastGatewayHeartbeatAt: new Date(),
        lastError: null,
      });
      console.log(`[Discord] Gateway ready as ${readyClient.user.tag}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Command sync failed";
      await updateDiscordConfiguration({ gatewayStatus: "degraded", lastError: message });
      console.error("[Discord] Command sync failed:", error);
    }
  });
  client.on(Events.InteractionCreate, interaction => {
    if (interaction.isChatInputCommand()) void handleInteraction(interaction);
  });
  client.on(Events.Error, async error => {
    const message = error.message.slice(0, 2000);
    await updateDiscordConfiguration({ gatewayStatus: "degraded", lastError: message });
    console.error("[Discord] Gateway error:", error);
  });
  await client.login(token);
}

export async function startDiscordBot() {
  if (!startPromise) startPromise = connectDiscord().catch(async error => {
    const message = error instanceof Error ? error.message : "Discord startup failed";
    await updateDiscordConfiguration({ gatewayStatus: "offline", lastError: message });
    console.error("[Discord] Startup failed:", error);
  });
  return startPromise;
}

async function categoryForGroup(guild: Guild, group: string) {
  const name = `QUOS · ${group}`;
  const existing = guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name === name);
  return existing ?? guild.channels.create({ name, type: ChannelType.GuildCategory });
}

export async function bootstrapPersonaChannels() {
  const { guildId } = discordEnvironment();
  if (!client?.isReady() || !guildId) throw new Error("Discord must be connected before channel bootstrap.");
  const guild = await client.guilds.fetch(guildId);
  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");
  const allPersonas = await db.select().from(personas).orderBy(personas.id);
  await updateDiscordConfiguration({ channelBootstrapStatus: "running", lastError: null });

  let created = 0;
  for (const persona of allPersonas) {
    const existing = await db
      .select()
      .from(channelProvisioning)
      .where(eq(channelProvisioning.personaId, persona.id))
      .limit(1);
    if (existing[0]?.status === "ready" && existing[0].discordChannelId) continue;

    try {
      await updateChannelProvisioning(persona.id, { status: "creating", attempts: (existing[0]?.attempts ?? 0) + 1, lastError: null });
      const plan = buildChannelProvisioningPlan({
        id: persona.id,
        name: persona.name,
        role: persona.role,
        group: persona.group as import("../shared/personas").PersonaGroup,
        channelSlug: persona.channelSlug,
        operatingInstructions: persona.operatingInstructions,
        commands: JSON.parse(persona.commandsJson),
      });
      const category = await categoryForGroup(guild, persona.group);
      const name = plan.channelName;
      const current = guild.channels.cache.find(channel => channel.type === ChannelType.GuildText && channel.name === name);
      const channel = current ?? await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `${persona.id} — ${persona.role}. Routes /qb, /research, /status, and /report to this internal persona.`,
      });
      await db.update(personas).set({ channelId: channel.id, status: "ready" }).where(eq(personas.id, persona.id));
      await updateChannelProvisioning(persona.id, {
        status: "ready",
        discordCategoryId: category.id,
        discordChannelId: channel.id,
      });
      created += current ? 0 : 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Channel creation failed";
      await updateChannelProvisioning(persona.id, { status: "failed", lastError: message });
    }
  }
  await updateDiscordConfiguration({ channelBootstrapStatus: "ready" });
  await recordReport({
    personaId: QB000.id,
    kind: "system",
    severity: "info",
    title: "Discord channel bootstrap completed",
    summary: `Provisioning pass completed. ${created} new channel(s) were created or repaired.`,
  });
  return { created, total: allPersonas.length };
}

export async function resyncDiscordCommands() {
  if (!client?.isReady()) throw new Error("Discord is not connected.");
  await syncCommands();
  return { commandCount: commands.length };
}
