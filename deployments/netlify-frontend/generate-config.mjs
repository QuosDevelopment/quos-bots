import { writeFile } from "node:fs/promises";

const configuredUrl = process.env.QUOS_DASHBOARD_URL || "";
if (configuredUrl && !/^https:\/\//.test(configuredUrl)) {
  throw new Error("QUOS_DASHBOARD_URL must use an https:// URL.");
}
await writeFile("config.js", `window.QUOS_DASHBOARD_URL = ${JSON.stringify(configuredUrl)};\n`);
