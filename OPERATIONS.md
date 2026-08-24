# QUOS Bots Operating Design

QUOS Bots uses one Discord application and one persistent Gateway client. It maintains a single internal roster of QB-000 and QB-001 through QB-101 rather than creating separate Discord accounts. QB-000 is the coordinator and receives structured activity, research, escalation, and system reports from every persona.

## Discord interaction model

The platform registers four application commands: `/qb`, `/research`, `/status`, and `/report`. Discord application commands are global or guild-level resources, so the service scopes the experience by resolving the dedicated channel that invoked a command. A command issued outside a provisioned QUOS channel is rejected without calling a persona. This keeps the public command surface compact and avoids attempting to create a separate command namespace for every persona.

Channel bootstrap is idempotent. It creates a `QUOS · <discipline>` category for each roster group, then creates or reuses the dedicated QB-000 and persona text channels. Progress, channel IDs, failures, and retries are stored in the database.

## Knowledge and source review model

Internet-grounded research begins with `/research` or the secured control dashboard. The assigned persona uses web search to produce a structured research draft, source list, caveats, tags, and a QB-000 report. Sources enter the shared knowledge hub as `pending`; research drafts remain unpublished until QB-000 vets the cited sources. Published knowledge preserves its producing persona, source references, citations, and reuse count.

The Discord knowledge boundary is persona-aware: a persona may read its own drafts, QB-000 may review any draft, and cross-persona reuse is limited to published items. The control dashboard is intentionally different: it is an administrator-only oversight surface, so it can inspect all draft sources, research, reports, and knowledge for governance and operational review.

## Hosting requirement

The Gateway client requires a persistent managed process. The application must be configured for reserved managed hosting before Discord activation. Required deployment secrets are `DISCORD_BOT_TOKEN`, `DISCORD_APPLICATION_ID`, and `DISCORD_GUILD_ID`; they are server-side only and must never be committed to source control or sent through Discord.
