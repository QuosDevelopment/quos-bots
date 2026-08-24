import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PERSONAS } from "./personas.mjs";
import { discoverPublicSources, extractGeminiText } from "./research.mjs";
import { appendBrainMemory, defaultState, ensureBotProfiles, recordEarning, recordTask } from "./state.mjs";
import { runTerryLearningCycles } from "./terry.mjs";

assert.equal(PERSONAS.length, 102, "portable roster must contain QB-000 plus QB-001–QB-101");
assert.equal(new Set(PERSONAS.map(persona => persona.id)).size, 102, "persona identifiers must be unique");
assert.equal(new Set(PERSONAS.map(persona => persona.channelSlug)).size, 102, "persona channel slugs must be unique");

const state = structuredClone(defaultState);
ensureBotProfiles(state, PERSONAS);
assert.equal(Object.keys(state.botProfiles).length, 101, "Firebase-compatible state must include all 101 operational personas");
recordTask(state, PERSONAS[1], "research", "completed", "Validated source bundle");
recordEarning(state, PERSONAS[1], 25, "USD", "Verified accounting entry");
assert.equal(state.tasks.length, 1, "task history must record real runtime work");
assert.equal(state.botProfiles[PERSONAS[1].id].earningsTotal, 25, "earnings must aggregate against the specified persona");
assert.equal(extractGeminiText({ candidates: [{ content: { parts: [{ text: "Gemini response" }] } }] }), "Gemini response", "Gemini output parsing must preserve model text");

const sources = await discoverPublicSources("machine learning engineering reliable deployment");
assert.ok(Array.isArray(sources), "public research must return an array");
assert.ok(sources.every(source => source.title && /^https?:\/\//.test(source.url)), "every collected source must preserve a public title and URL");

let synthesisCalls = 0;
const learning = await runTerryLearningCycles({
  persona: PERSONAS[1],
  task: "Explain reliable deployment practices.",
  cycles: 5,
  discover: async query => [{ title: `Source for ${query}`, url: `https://example.com/${synthesisCalls}`, excerpt: "Public test source", publisher: "Example" }],
  synthesize: async () => `Improved English answer ${++synthesisCalls} [1]`,
});
assert.equal(learning.cycles.length, 5, "Terry must run exactly five bounded learning cycles by default");
assert.equal(synthesisCalls, 5, "each learning cycle must synthesize an improved role-aware answer");
assert.equal(learning.sources.length, 5, "cycle source records must remain attributable");

const brainDirectory = await mkdtemp(join(tmpdir(), "quos-brain-"));
process.env.BRAIN_PATH = join(brainDirectory, "brain.jsonl");
await appendBrainMemory(state, { personaId: PERSONAS[1].id, scope: "private", type: "learning_cycle", summary: "Durable memory test" });
const brainLines = (await readFile(process.env.BRAIN_PATH, "utf8")).trim().split("\n").map(JSON.parse);
assert.equal(brainLines.length, 1, "brain.jsonl must append one permanent memory record per write");
assert.equal(state.brain[0].summary, "Durable memory test", "in-memory state must retain the most recent brain record");
await rm(brainDirectory, { recursive: true, force: true });
console.log(`Standalone smoke test passed: ${PERSONAS.length} personas and ${sources.length} public source(s) validated.`);
