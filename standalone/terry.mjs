import { discoverResearchSources, synthesizePersona } from "./research.mjs";

export const TERRY = Object.freeze({ id: "QB-000", name: "Terry", role: "QUOS coordinator and learning orchestrator" });

const clip = (value, limit = 1800) => String(value || "").slice(0, limit);
const asCycleCount = value => Math.max(1, Math.min(5, Number(value) || 5));
const sourceList = sources => sources.map((source, index) => `[${index + 1}] ${source.title}\n${source.url}\n${clip(source.excerpt, 420)}`).join("\n\n");

export function recentMemoryContext(memory = [], personaId) {
  return memory.filter(item => item.personaId === personaId || item.scope === "shared")
    .slice(0, 4)
    .map(item => `- ${clip(item.summary || item.response, 500)}`)
    .join("\n");
}

export async function runTerryLearningCycles({ persona, task, memory = [], cycles = process.env.TERRY_CYCLES || 5, discover = discoverResearchSources, synthesize = synthesizePersona }) {
  const cycleCount = asCycleCount(cycles);
  const workingMemory = recentMemoryContext(memory, persona.id);
  const records = [];
  let prior = workingMemory || "No prior relevant memory.";

  for (let cycle = 1; cycle <= cycleCount; cycle += 1) {
    const researchQuery = `${task} ${persona.role} evidence iteration ${cycle}`;
    const sources = await discover(researchQuery);
    const response = await synthesize([
      { role: "system", content: `${persona.operatingInstructions}\nYou are operating as part of Terry/QB-000's bounded five-cycle learning process. Improve the working answer using only the supplied public source bundle and prior memory. Reply in English. Cite supplied sources with [n] markers only. Do not claim to have browsed a source beyond its supplied title, URL, and excerpt. Identify uncertainty. Never carry out external side effects; this stage is analysis, research, and a proposed next action only.` },
      { role: "user", content: `Task: ${task}\nCycle: ${cycle} of ${cycleCount}\nPrior working memory:\n${clip(prior, 1800)}\n\nPublic source bundle:\n${sourceList(sources) || "No sources returned."}` },
    ], 1000) || `Cycle ${cycle} collected ${sources.length} public source record(s), but Gemini synthesis is unavailable.`;
    const record = {
      id: crypto.randomUUID(),
      type: "learning_cycle",
      personaId: persona.id,
      coordinatorId: TERRY.id,
      task,
      cycle,
      cycleCount,
      researchQuery,
      summary: response,
      sources,
      scope: "private",
      createdAt: new Date().toISOString(),
    };
    records.push(record);
    prior = `${prior}\n\nCycle ${cycle}: ${clip(response, 1400)}`;
  }

  const final = records.at(-1)?.summary || "No learning cycle completed.";
  return {
    id: crypto.randomUUID(),
    personaId: persona.id,
    coordinatorId: TERRY.id,
    task,
    cycleCount,
    response: final,
    cycles: records,
    sources: [...new Map(records.flatMap(record => record.sources).map(source => [source.url, source])).values()],
    createdAt: new Date().toISOString(),
  };
}
