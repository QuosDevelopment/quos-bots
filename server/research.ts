import { eq } from "drizzle-orm";
import { knowledgeItems, knowledgeSources, personas, researchRuns } from "../drizzle/schema";
import { PERSONA_BY_ID } from "../shared/personas";
import { invokeLLM } from "./_core/llm";
import { getDb, recordActivity, recordReport } from "./db";

type SourceType = "official" | "academic" | "industry" | "news" | "other";

type GroundedResearch = {
  title: string;
  summary: string;
  findings: string[];
  caveats: string[];
  tags: string[];
  sources: Array<{
    title: string;
    url: string;
    publisher: string;
    sourceType: SourceType;
    relevance: string;
  }>;
};

const researchSchema = {
  name: "grounded_persona_research",
  strict: true,
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      summary: { type: "string" },
      findings: { type: "array", items: { type: "string" } },
      caveats: { type: "array", items: { type: "string" } },
      tags: { type: "array", items: { type: "string" } },
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            publisher: { type: "string" },
            sourceType: {
              type: "string",
              enum: ["official", "academic", "industry", "news", "other"],
            },
            relevance: { type: "string" },
          },
          required: ["title", "url", "publisher", "sourceType", "relevance"],
          additionalProperties: false,
        },
      },
    },
    required: ["title", "summary", "findings", "caveats", "tags", "sources"],
    additionalProperties: false,
  },
};

function responseText(content: string | Array<{ type: string; text?: string }>) {
  return typeof content === "string"
    ? content
    : content.map(part => part.type === "text" ? part.text ?? "" : "").join("\n");
}

function normalizedSources(sources: GroundedResearch["sources"]) {
  return sources
    .filter(source => {
      try {
        const url = new URL(source.url);
        return url.protocol === "https:" || url.protocol === "http:";
      } catch {
        return false;
      }
    })
    .slice(0, 6);
}

export async function runGroundedResearch(personaId: string, query: string): Promise<GroundedResearch> {
  const persona = PERSONA_BY_ID.get(personaId);
  if (!persona) throw new Error(`Unknown persona: ${personaId}`);
  if (!query.trim()) throw new Error("A research question is required.");

  const db = await getDb();
  if (!db) throw new Error("Database is unavailable.");

  const inserted = await db.insert(researchRuns).values({
    personaId,
    query: query.trim(),
    model: "gpt-5-mini",
    status: "running",
  });
  const researchId = Number(inserted[0].insertId);
  await db.update(personas).set({ status: "learning" }).where(eq(personas.id, personaId));

  try {
    const response = await invokeLLM({
      model: "gpt-5-mini",
      maxTokens: 2800,
      tools: [{ type: "web_search", web_search: { max_uses: 6, search_context_size: "medium" } }],
      toolChoice: "auto",
      response_format: { type: "json_schema", json_schema: researchSchema },
      messages: [
        {
          role: "system",
          content: `${persona.operatingInstructions} Use internet search for this task. Prefer primary, official, academic, or directly authoritative material. Never invent a source, URL, publication title, or finding. Produce a compact evidence synthesis and name caveats. This output becomes a draft until QB-000 reviews its cited sources.`,
        },
        { role: "user", content: `Research question: ${query.trim()}` },
      ],
    });

    const result = JSON.parse(responseText(response.choices[0]?.message.content ?? "")) as GroundedResearch;
    const sources = normalizedSources(result.sources);
    const sourceIds: number[] = [];

    for (const source of sources) {
      await db
        .insert(knowledgeSources)
        .values({
          url: source.url,
          title: source.title.slice(0, 512),
          publisher: source.publisher.slice(0, 255),
          sourceType: source.sourceType,
          vettingStatus: "pending",
          qualityScore: 0,
          excerpt: source.relevance,
        })
        .onDuplicateKeyUpdate({
          set: {
            title: source.title.slice(0, 512),
            publisher: source.publisher.slice(0, 255),
            sourceType: source.sourceType,
            excerpt: source.relevance,
          },
        });
      const sourceRow = await db
        .select({ id: knowledgeSources.id })
        .from(knowledgeSources)
        .where(eq(knowledgeSources.url, source.url))
        .limit(1);
      if (sourceRow[0]) sourceIds.push(sourceRow[0].id);
    }

    await db.insert(knowledgeItems).values({
      personaId,
      sourceId: sourceIds[0] ?? null,
      title: result.title.slice(0, 512),
      summary: result.summary,
      content: JSON.stringify({ findings: result.findings, caveats: result.caveats }),
      tagsJson: JSON.stringify(result.tags),
      citationsJson: JSON.stringify(sources),
      status: "draft",
    });
    await db
      .update(researchRuns)
      .set({ status: "completed", sourcesUsed: sources.length, completedAt: new Date() })
      .where(eq(researchRuns.id, researchId));
    await db.update(personas).set({ status: "ready" }).where(eq(personas.id, personaId));

    await recordActivity({
      personaId,
      eventType: "research_completed",
      summary: `${personaId} completed a source-grounded research draft: ${result.title}`,
      metadata: { researchId, sourcesUsed: sources.length },
    });
    await recordReport({
      personaId,
      kind: "research",
      severity: sources.length >= 2 ? "info" : "watch",
      title: `Research draft ready — ${personaId}`,
      summary: `${result.summary} ${sources.length} source(s) await QB-000 review before publication.`,
      payload: { researchId, sourceIds, citations: sources },
    });
    return { ...result, sources };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Research failed";
    await db.update(researchRuns).set({ status: "failed", error: message }).where(eq(researchRuns.id, researchId));
    await db.update(personas).set({ status: "attention" }).where(eq(personas.id, personaId));
    await recordReport({
      personaId,
      kind: "escalation",
      severity: "watch",
      title: `Research issue — ${personaId}`,
      summary: message,
      payload: { researchId },
    });
    throw error;
  }
}

export async function answerAsPersona(personaId: string, prompt: string) {
  const persona = PERSONA_BY_ID.get(personaId);
  if (!persona) throw new Error(`Unknown persona: ${personaId}`);
  const response = await invokeLLM({
    model: "gpt-5-mini",
    maxTokens: 1200,
    messages: [
      {
        role: "system",
        content: `${persona.operatingInstructions} Answer concisely and analytically. If the question needs current external facts, direct the user to /research instead of claiming unverified information. Do not give personalized legal, tax, investment, or medical advice.`,
      },
      { role: "user", content: prompt.trim() },
    ],
  });
  const answer = responseText(response.choices[0]?.message.content ?? "No response returned.");
  await recordActivity({
    personaId,
    eventType: "persona_response",
    summary: `${personaId} responded to a channel request.`,
  });
  await recordReport({
    personaId,
    kind: "activity",
    severity: "info",
    title: `Persona response — ${personaId}`,
    summary: answer.slice(0, 500),
  });
  return answer;
}
