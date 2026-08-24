# Environment configuration

Set these values in your local shell, Replit Secrets, or Render Environment settings. Do not commit a `.env` file or paste credentials into Discord messages.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | Yes | HTTP status-console port assigned by the host. |
| `DISCORD_BOT_TOKEN` | Yes | Token for the single QUOS Discord bot application. |
| `DISCORD_APPLICATION_ID` | Yes | Discord application ID used to register slash commands. |
| `DISCORD_GUILD_ID` | Yes | Quos Bots server ID; commands outside this guild are ignored. |
| `DASHBOARD_USERNAME` | Yes | HTTP Basic Auth username for the small portable status console. |
| `DASHBOARD_PASSWORD` | Yes | HTTP Basic Auth password for the portable status console. |
| `QUOS_STATE_PATH` | No | JSON state-store path; default: `./data/quos-state.json`. See [STORAGE.md](./STORAGE.md) for local, Replit, and Render durability limits. |
| `STATE_BACKEND` | No | `file` (default) or `postgres`. |
| `DATABASE_URL` | If `STATE_BACKEND=postgres` | PostgreSQL connection string for the optional durable state backend. |
| `DATABASE_SSL` | No | Set `false` only for local PostgreSQL without TLS; TLS is assumed otherwise. |
| `SCHEDULE_ENABLED` | No | Set `false` to disable automatic research; default: `true`. |
| `RESEARCH_CRON` | No | Five-field UTC cron expression; default: `0 9 * * *`. |
| `RESEARCH_MAX_PERSONAS_PER_RUN` | No | Number of personas to research per schedule; default: `1`. |
| `PUBLIC_SEARCH_ENABLED` | No | Set `false` to disable public source discovery. |
| `LLM_API_KEY` | No | OpenAI-compatible key for synthesis and role answers. |
| `LLM_BASE_URL` | No | OpenAI-compatible API base URL; defaults to OpenAI. |
| `LLM_MODEL` | No | Model name for synthesis; defaults to `gpt-4o-mini`. |

> The portable runtime requires the three Discord values, a port, and status-console credentials. It will run source collection without an LLM key, but `/qb` synthesis and narrative research summaries require an OpenAI-compatible provider.
