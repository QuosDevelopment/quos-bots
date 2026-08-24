const decode = value => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, "\"")
  .replace(/&#39;/g, "'")
  .replace(/<[^>]+>/g, "")
  .trim();

const itemField = (item, field) => decode(item.match(new RegExp(`<${field}>([\\s\\S]*?)<\\/${field}>`, "i"))?.[1] || "");

export async function discoverPublicSources(query) {
  if (process.env.PUBLIC_SEARCH_ENABLED === "false") return [];
  const endpoint = new URL("https://www.bing.com/search");
  endpoint.searchParams.set("format", "rss");
  endpoint.searchParams.set("q", query);
  const response = await fetch(endpoint, {
    headers: { "user-agent": "QUOS-Bots/1.0 (public research; contact operator through Discord)" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Public source search returned ${response.status}.`);
  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => {
    const item = match[1];
    return {
      title: itemField(item, "title"),
      url: itemField(item, "link"),
      excerpt: itemField(item, "description"),
      publisher: (() => {
        try { return new URL(itemField(item, "link")).hostname.replace(/^www\./, ""); } catch { return "public web"; }
      })(),
    };
  }).filter(source => source.title && /^https?:\/\//.test(source.url)).slice(0, 6);
}

export function extractGeminiText(payload) {
  return payload?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim() || null;
}

async function callGemini(messages, maxTokens = 900) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const system = messages.find(message => message.role === "system")?.content;
  const contents = messages
    .filter(message => message.role !== "system")
    .map(message => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] }));
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature: 0.25 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Gemini synthesis returned ${response.status}: ${await response.text()}`);
  return extractGeminiText(await response.json());
}

async function callOpenAiCompatible(messages, maxTokens = 900) {
  const key = process.env.LLM_API_KEY;
  if (!key) return null;
  const base = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.LLM_MODEL || "gpt-4o-mini", messages, max_tokens: maxTokens, temperature: 0.25 }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`LLM synthesis returned ${response.status}: ${await response.text()}`);
  const payload = await response.json();
  return payload.choices?.[0]?.message?.content?.trim() || null;
}

async function callSynthesis(messages, maxTokens = 900) {
  return (await callGemini(messages, maxTokens)) || (await callOpenAiCompatible(messages, maxTokens));
}

export async function researchPersona(persona, question) {
  const sources = await discoverPublicSources(question);
  const sourceList = sources.map((source, index) => `[${index + 1}] ${source.title}\n${source.url}\n${source.excerpt}`).join("\n\n");
  const summary = await callSynthesis([
    { role: "system", content: `${persona.operatingInstructions} Write a concise research synthesis. Cite only the supplied source list using [n] markers. Do not invent facts or citations. State uncertainty and source-quality limitations.` },
    { role: "user", content: `Question: ${question}\n\nPublic source list:\n${sourceList || "No sources were returned."}` },
  ]) || (sources.length
    ? `Public source bundle collected for **${question}**. Configure GEMINI_API_KEY to synthesize findings; QB-000 can review the cited sources now.`
    : `No public sources were returned for **${question}**. Retry when the search endpoint is available.`);
  return { id: crypto.randomUUID(), personaId: persona.id, role: persona.role, question, summary, sources, status: "draft", createdAt: new Date().toISOString() };
}

export async function answerPersona(persona, prompt) {
  const answer = await callSynthesis([
    { role: "system", content: `${persona.operatingInstructions} Answer in the scope of your role. Be concise. When current evidence is needed, direct the user to /research rather than asserting unsourced facts. Do not provide individualized legal, tax, medical, or investment advice.` },
    { role: "user", content: prompt },
  ]);
  return answer || `${persona.id} is ready, but GEMINI_API_KEY is not configured. Use /research for a cited public-source bundle or add a Gemini API key for role-specific synthesis.`;
}
