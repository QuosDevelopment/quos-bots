import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { PERSONAS } from "../standalone/personas.mjs";

const output = resolve("github-pages-dashboard/personas.js");
const personas = PERSONAS
  .filter(persona => persona.id !== "QB-000")
  .map(({ id, name, role, group, channelSlug }) => ({ id, name, role, group, channelSlug }));

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `export const PERSONAS = ${JSON.stringify(personas, null, 2)};\n`);
console.log(`Generated ${personas.length} GitHub Pages personas at ${output}.`);
