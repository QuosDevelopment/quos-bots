import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import mysql from "mysql2/promise";
import { PERSONAS } from "../standalone/personas.mjs";

const required = ["DISCORD_BOT_TOKEN", "DISCORD_GUILD_ID", "DATABASE_URL"];
for (const key of required) if (!process.env[key]) throw new Error(`${key} must be set before channel bootstrap.`);

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const database = await mysql.createConnection(process.env.DATABASE_URL);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  await new Promise((resolve, reject) => {
    client.once("ready", resolve);
    client.once("error", reject);
    void client.login(process.env.DISCORD_BOT_TOKEN).catch(reject);
  });

  const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
  await guild.channels.fetch();
  const categories = new Map();
  let created = 0;
  let reused = 0;
  const failures = [];

  for (const persona of PERSONAS) {
    try {
      const categoryName = `QUOS · ${persona.group}`;
      let category = categories.get(categoryName)
        || guild.channels.cache.find(channel => channel.type === ChannelType.GuildCategory && channel.name === categoryName);
      if (!category) {
        category = await guild.channels.create({ name: categoryName, type: ChannelType.GuildCategory });
        await delay(750);
      }
      categories.set(categoryName, category);

      const existing = guild.channels.cache.find(channel => channel.type === ChannelType.GuildText && channel.name === persona.channelSlug);
      const channel = existing || await guild.channels.create({
        name: persona.channelSlug,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: `${persona.id} — ${persona.role}. Use /qb, /research, /knowledge, /status, and /report.`,
      });
      if (existing) reused += 1;
      else {
        created += 1;
        await delay(750);
      }

      await database.execute("UPDATE `personas` SET `channelId` = ?, `status` = 'ready' WHERE `id` = ?", [channel.id, persona.id]);
      await database.execute(
        "INSERT INTO `channelProvisioning` (`personaId`, `categoryName`, `discordCategoryId`, `discordChannelId`, `status`, `attempts`, `lastError`) VALUES (?, ?, ?, ?, 'ready', 1, NULL) ON DUPLICATE KEY UPDATE `categoryName` = VALUES(`categoryName`), `discordCategoryId` = VALUES(`discordCategoryId`), `discordChannelId` = VALUES(`discordChannelId`), `status` = 'ready', `attempts` = `attempts` + 1, `lastError` = NULL",
        [persona.id, persona.group, category.id, channel.id],
      );
    } catch (error) {
      failures.push({ personaId: persona.id, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }

  await database.execute(
    "UPDATE `discordConfiguration` SET `channelBootstrapStatus` = ?, `lastError` = ? WHERE `id` = 'primary'",
    [failures.length ? "failed" : "ready", failures.length ? JSON.stringify(failures.slice(0, 5)) : null],
  );
  console.log(JSON.stringify({ created, reused, failures, total: PERSONAS.length }));
  if (failures.length) process.exitCode = 1;
} finally {
  await database.end();
  client.destroy();
}
