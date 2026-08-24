# Environment configuration

Set these values in your local shell or **Replit Secrets** for the Discord runtime. The Render dashboard uses only the Firebase and dashboard fields identified below. Do not commit a `.env` file or paste credentials into Discord messages.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | Yes | HTTP status-console port assigned by the host. |
| `DISCORD_BOT_TOKEN` | Yes | Token for the single QUOS Discord bot application. |
| `DISCORD_APPLICATION_ID` | Yes | Discord application ID used to register slash commands. |
| `DISCORD_GUILD_ID` | Yes | Quos Bots server ID; commands outside this guild are ignored. |
| `DASHBOARD_USERNAME` | Yes | HTTP Basic Auth username for the portable status console and Render dashboard. |
| `DASHBOARD_PASSWORD` | Yes | HTTP Basic Auth password for the portable status console and Render dashboard. |
| `QUOS_STATE_PATH` | No | JSON state-store path; default: `./data/quos-state.json`. See [STORAGE.md](./STORAGE.md) for local, Replit, and Render durability limits. |
| `STATE_BACKEND` | Yes for Firebase | Set `firebase` for the requested durable Firebase Firestore backend. `file` is only a local-development fallback; `postgres` remains an optional legacy adapter. |
| `FIREBASE_SERVICE_ACCOUNT_JSON_B64` | If `STATE_BACKEND=firebase` | Base64-encoded Firebase Admin service-account JSON. Add in Replit and Render private-secret fields only. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | No | Local-development alternative to the base64 value; never commit the JSON. |
| `DATABASE_URL` | If `STATE_BACKEND=postgres` | PostgreSQL connection string for the optional durable state backend. |
| `DATABASE_SSL` | No | Set `false` only for local PostgreSQL without TLS; TLS is assumed otherwise. |
| `SCHEDULE_ENABLED` | No | Set `false` to disable automatic research; default: `true`. |
| `RESEARCH_CRON` | No | Five-field UTC cron expression; default: `0 9 * * *`. |
| `RESEARCH_MAX_PERSONAS_PER_RUN` | No | Number of personas to research per schedule; default: `1`. |
| `PUBLIC_SEARCH_ENABLED` | No | Set `false` to disable public source discovery. |
| `GEMINI_API_KEY` | Recommended | Google AI Studio Gemini API key used for role-specific synthesis. Keep it in Replit Secrets only. |
| `GEMINI_MODEL` | No | Gemini text model name; default: `gemini-2.5-flash`. Free-tier availability and limits vary by project. |
| `LLM_API_KEY` | No | Optional OpenAI-compatible fallback for synthesis and role answers. |
| `LLM_BASE_URL` | No | OpenAI-compatible API base URL; defaults to OpenAI. |
| `LLM_MODEL` | No | Model name for synthesis; defaults to `gpt-4o-mini`. |

> The portable runtime requires the three Discord values, a port, dashboard credentials, and Firebase Admin credentials for durable multi-host use. It will run source collection without an AI key, but `/qb` synthesis and narrative research summaries require `GEMINI_API_KEY` or the optional OpenAI-compatible fallback.

## Safe Firebase service-account encoding

On a local machine, write the downloaded Firebase service-account JSON to a protected temporary file, then encode it without printing it to a terminal transcript: `base64 -i service-account.json | pbcopy` on macOS or `base64 -w0 service-account.json` on Linux. Paste the output directly into the provider’s private secret field and remove the downloaded key when finished.
