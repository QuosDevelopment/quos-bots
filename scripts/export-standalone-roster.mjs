import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const sourcePath = resolve("shared/personas.ts");
const outputPath = resolve("standalone/personas.mjs");
const source = await readFile(sourcePath, "utf8");
const pattern = /createPersona\("(QB-\d{3})", "([^"]+)", "([^"]+)"/g;
const personas = [{ id: "QB-000", name: "QB-000", role: "Coordinator", group: "Coordination" }];

for (const match of source.matchAll(pattern)) {
  const [, id, role, group] = match;
  personas.push({ id, name: id, role, group });
}

if (personas.length !== 102) throw new Error(`Expected 102 personas, found ${personas.length}.`);
for (const persona of personas) {
  persona.channelSlug = persona.id === "QB-000"
    ? "qb-000-coordinator"
    : `${persona.id.toLowerCase()}-${persona.role.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
  persona.operatingInstructions = `You are ${persona.id}, the QUOS Bots ${persona.role} persona. Work from attributable evidence, clearly distinguish fact from inference, publish reusable cited findings, and report material work or risks to QB-000.`;
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `export const PERSONAS = ${JSON.stringify(personas, null, 2)};\nexport const PERSONA_BY_ID = new Map(PERSONAS.map(persona => [persona.id, persona]));\n`);
console.log(`Wrote ${personas.length} portable personas to ${outputPath}`);
