import { describe, expect, it } from "vitest";
import { PERSONAS } from "../shared/personas";

describe("Discord bot credentials", () => {
  it("authenticates the configured bot token with Discord", async () => {
    const token = process.env.DISCORD_BOT_TOKEN;
    expect(token, "DISCORD_BOT_TOKEN must be configured").toBeTruthy();

    const response = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(15_000),
    });

    expect(response.status, `Discord credential validation failed with HTTP ${response.status}`).toBe(200);
    const bot = await response.json() as { id?: string; bot?: boolean };
    expect(bot.id).toBeTruthy();
    expect(bot.bot).toBe(true);

    const guildId = process.env.DISCORD_GUILD_ID;
    expect(guildId, "DISCORD_GUILD_ID must be configured").toBeTruthy();
    const guildResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: { authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    expect(guildResponse.status, `Guild validation failed with HTTP ${guildResponse.status}; add the bot to Quos Bots and check the server ID.`).toBe(200);
    const guild = await guildResponse.json() as { id?: string; name?: string };
    expect(guild.id).toBe(guildId);
    expect(guild.name).toBeTruthy();

    const commandResponse = await fetch(`https://discord.com/api/v10/applications/${process.env.DISCORD_APPLICATION_ID}/guilds/${guildId}/commands`, {
      headers: { authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    expect(commandResponse.status, `Command sync validation failed with HTTP ${commandResponse.status}`).toBe(200);
    const commands = await commandResponse.json() as Array<{ name: string }>;
    expect(commands.map(command => command.name)).toEqual(expect.arrayContaining(["qb", "research", "knowledge", "status", "report"]));

    const channelResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(15_000),
    });
    expect(channelResponse.status, `Channel validation failed with HTTP ${channelResponse.status}`).toBe(200);
    const channels = await channelResponse.json() as Array<{ id: string; name: string; type: number }>;
    const channelNames = new Set(channels.filter(channel => channel.type === 0).map(channel => channel.name));
    expect(PERSONAS.every(persona => channelNames.has(persona.channelSlug))).toBe(true);
  }, 30_000);
});
