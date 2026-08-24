# State storage and database boundary

The portable QUOS Bots runtime intentionally uses a **file-backed JSON state store** rather than a managed database. This is the only no-extra-cost storage mode that works immediately for local development and a basic Replit session. It stores channel mappings, research drafts, source citations, publications, reports, and the automatic-research rotation index in the path set by `QUOS_STATE_PATH`.

| Deployment target | Default state configuration | Durability expectation | Recommended use |
| --- | --- | --- | --- |
| Local computer | `QUOS_STATE_PATH=./data/quos-state.json` | Durable while the local project directory is retained | Development and private testing |
| Replit session | `QUOS_STATE_PATH=./data/quos-state.json` | Project files can retain the state, subject to workspace lifecycle and user action | Early experimentation |
| Render free web service | `QUOS_STATE_PATH=./data/quos-state.json` | **Ephemeral**; restarts can erase channel mappings and research history | Stateless demos only |

> The portable service starts without a database URL by design. Its zero-cost default is file state. An optional PostgreSQL adapter is included for a trial or externally supplied free database, but no third-party database is represented as permanently free or production-durable.

## Optional PostgreSQL backend

The included `state.mjs` adapter supports PostgreSQL. Set `STATE_BACKEND=postgres` and add `DATABASE_URL` as a host secret; set `DATABASE_SSL=false` only for a local non-TLS PostgreSQL instance. The runtime automatically creates one `quos_state` table and stores the complete state document there. No additional schema migration is needed.

To import existing file state, run `npm run migrate:file-to-postgres` from `standalone/` with `DATABASE_URL` set. It reads `MIGRATION_STATE_PATH` when provided, otherwise `QUOS_STATE_PATH`, then imports the familiar `channels`, `knowledge`, `reports`, `runs`, and `nextPersonaIndex` shape before scheduled research starts.

For **Render**, create a PostgreSQL service, copy its connection string into the web service’s `DATABASE_URL` environment variable, and set `STATE_BACKEND=postgres`. Render documents that free PostgreSQL databases expire after 30 days and do not offer backups, so this is a temporary test path, not production storage.[1]

For **Replit**, add an externally supplied PostgreSQL connection string to Replit Secrets as `DATABASE_URL`, set `STATE_BACKEND=postgres`, and run the migration command in the Replit shell before running the bot. Never hardcode a connection string into `.replit`, source files, or Discord messages.

## References

[1] [Render free instances](https://render.com/docs/free)
