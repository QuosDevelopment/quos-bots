import assert from "node:assert/strict";
import { PERSONAS } from "./personas.mjs";
import { discoverPublicSources } from "./research.mjs";

assert.equal(PERSONAS.length, 102, "portable roster must contain QB-000 plus QB-001–QB-101");
assert.equal(new Set(PERSONAS.map(persona => persona.id)).size, 102, "persona identifiers must be unique");
assert.equal(new Set(PERSONAS.map(persona => persona.channelSlug)).size, 102, "persona channel slugs must be unique");

const sources = await discoverPublicSources("machine learning engineering reliable deployment");
assert.ok(Array.isArray(sources), "public research must return an array");
assert.ok(sources.every(source => source.title && /^https?:\/\//.test(source.url)), "every collected source must preserve a public title and URL");
console.log(`Standalone smoke test passed: ${PERSONAS.length} personas and ${sources.length} public source(s) validated.`);
