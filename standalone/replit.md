# Replit setup

Import this repository as a Node.js Repl. The supplied `.replit` file runs `standalone/index.mjs`. Add the values from [CONFIGURATION.md](./CONFIGURATION.md) to Replit Secrets rather than committing a `.env` file. The run command launches the secured status page, the single Discord Gateway client, and the optional in-process automatic research schedule.

Use the free Repl session while you are testing. A Replit Scheduled deployment runs a command and then stops; it is appropriate for a separate one-off research job but cannot retain the Discord Gateway connection. Replit documents its Reserved VM as the always-on bot option, so this package does not depend on that paid configuration. The bot reconnects only while the app process is awake.
