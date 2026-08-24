# QUOS Bots standalone runtime

This directory is the portable **one Discord application, 101 internal personas** runtime. It uses one bot token, one Gateway connection, five compact slash commands, individual QB-000/QB-001–QB-101 channels, a local JSON state store, public-source research, citations, shared-knowledge publication through QB-000, and structured reports to QB-000.

The repository root contains a `render.yaml` blueprint and `.replit` run configuration that point to this directory. They do not include secrets.

## Quick start

Run `node ../scripts/export-standalone-roster.mjs` from the repository root, then set the platform secrets described in [CONFIGURATION.md](./CONFIGURATION.md). Run `npm install` and `npm start` from this directory. The server requires `PORT` explicitly so host platforms can choose the listening port.

Run `npm run bootstrap` once after the bot is installed in the Quos Bots Discord server. It creates or reuses the QB-000 channel and 101 persona channels grouped by discipline. The bot needs permission to manage channels during bootstrap, plus standard permissions to view and send messages in the resulting channels.

## Command surface

The Discord app registers `/qb`, `/research`, `/knowledge`, `/status`, `/report`, and `/vet`. The first five are scoped to the persona whose channel receives the command. `/vet` is restricted to QB-000 and publishes a cited research draft to the shared knowledge set. This arrangement keeps the visible command namespace small while giving every persona its own contextual command experience.

## Free-tier behavior

The runtime works for local testing, a Replit session, or a Render free web service. However, free platforms may sleep or stop a process. When the process sleeps, Discord sees the bot as offline and scheduled research does not run; opening the service wakes it and the Gateway reconnects. The schedule uses `node-cron` only within this portable standalone runtime, not the managed control dashboard.

Render’s free web services may spin down after inactivity, while Render cron jobs and always-on background workers are paid offerings. Replit documents Reserved VM as its bot/always-on option; Scheduled deployments run and stop. Therefore no provider can provide a continuously connected Discord bot and dependable scheduled work at zero cost. This package intentionally favors free experimentation and predictable restart behavior over a misleading 24/7 claim.

## Research and citations

`/research` collects results through a public Bing RSS endpoint and records titles, URLs, excerpts, and publishers. It does not bypass paywalls, authentication, robots controls, or rate limits. An optional OpenAI-compatible `LLM_API_KEY` synthesizes the cited source bundle and powers `/qb`; without it, the bot still stores and reports source bundles but does not fabricate an AI answer. Keep all Discord and LLM credentials in platform secrets.

## State and durability

State defaults to `./data/quos-state.json`. This is suitable for local runs and Replit project storage. Render’s free filesystem is ephemeral, so research history and channel mappings can be reset on restart. For durable multi-user operation, move the state adapter to a managed database before depending on production continuity.

See [STORAGE.md](./STORAGE.md) for the explicit storage settings and migration boundary for local, Replit, and Render use.

## References

[1] [Render free instances](https://render.com/docs/free) states that free web services spin down after 15 minutes of inactivity, including when idle WebSocket activity is absent.  
[2] [Replit deployment types](https://docs.replit.com/features/publishing/deployment-types) distinguishes an always-on Reserved VM for bots from Scheduled deployments that run a command and then stop.
