import assert from "node:assert/strict";
import { PERSONAS } from "./personas.mjs";
import { discoverPublicSources, extractGeminiText } from "./research.mjs";
import { defaultState, ensureBotProfiles, recordEarning, recordTask } from "./state.mjs";

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
console.log(`Standalone smoke test passed: ${PERSONAS.length} personas and ${sources.length} public source(s) validated.`);
