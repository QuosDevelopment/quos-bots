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
    const url = itemField(item, "link");
    return {
      title: itemField(item, "title"),
      url,
      excerpt: itemField(item, "description"),
      publisher: (() => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "public web"; } })(),
      sourceType: "web",
    };
  }).filter(source => source.title && /^https?:\/\//.test(source.url)).slice(0, 6);
}

async function fetchJson(url, label) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${label} returned ${response.status}.`);
  return response.json();
}

export async function discoverWikipediaSources(query) {
  const endpoint = new URL("https://en.wikipedia.org/w/api.php");
  endpoint.search = new URLSearchParams({ action: "query", list: "search", srsearch: query, srlimit: "5", format: "json", origin: "*" }).toString();
  const payload = await fetchJson(endpoint, "Wikipedia search");
  return (payload?.query?.search || []).map(item => ({
    title: item.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(item.title).replace(/\s+/g, "_"))}`,
    excerpt: decode(item.snippet || ""),
    publisher: "Wikipedia",
    sourceType: "wikipedia",
  })).filter(source => source.title && source.url);
}

export async function discoverGoogleNewsSources(query) {
  const endpoint = new URL("https://news.google.com/rss/search");
  endpoint.search = new URLSearchParams({ q: query, hl: "en-US", gl: "US", ceid: "US:en" }).toString();
  const response = await fetch(endpoint, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Google News RSS returned ${response.status}.`);
  const xml = await response.text();
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map(match => {
    const item = match[1];
    return { title: itemField(item, "title"), url: itemField(item, "link"), excerpt: itemField(item, "description"), publisher: "Google News", sourceType: "google_news" };
  }).filter(source => source.title && /^https?:\/\//.test(source.url)).slice(0, 6);
}

export async function discoverYouTubeSources(query) {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [{
    title: `YouTube search: ${query}`,
    url: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`,
    excerpt: "Public YouTube search link. Configure YOUTUBE_API_KEY to collect individual video titles and descriptions for synthesis.",
    publisher: "YouTube",
    sourceType: "youtube_search",
  }];
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
  endpoint.search = new URLSearchParams({ part: "snippet", type: "video", maxResults: "5", q: query, key }).toString();
  const payload = await fetchJson(endpoint, "YouTube Data API search");
  return (payload?.items || []).map(item => ({
    title: item?.snippet?.title || "YouTube video",
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(item?.id?.videoId || "")}`,
    excerpt: item?.snippet?.description || "",
    publisher: item?.snippet?.channelTitle || "YouTube",
    sourceType: "youtube",
  })).filter(source => source.url !== "https://www.youtube.com/watch?v=");
}

export async function discoverGoogleCustomSearchSources(query) {
  const key = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_ID;
  if (!key || !cx) return [];
  const endpoint = new URL("https://www.googleapis.com/customsearch/v1");
  endpoint.search = new URLSearchParams({ q: query, key, cx, num: "5" }).toString();
  const payload = await fetchJson(endpoint, "Google Custom Search");
  return (payload?.items || []).map(item => ({
    title: item.title || "Google search result",
    url: item.link,
    excerpt: item.snippet || "",
    publisher: "Google Custom Search",
    sourceType: "google_custom_search",
  })).filter(source => source.title && /^https?:\/\//.test(source.url));
}

export async function discoverResearchSources(query) {
  const attempts = await Promise.allSettled([
    discoverPublicSources(query),
    discoverWikipediaSources(query),
    discoverGoogleNewsSources(query),
    discoverYouTubeSources(query),
    discoverGoogleCustomSearchSources(query),
  ]);
  const seen = new Set();
  return attempts.flatMap(attempt => attempt.status === "fulfilled" ? attempt.value : []).filter(source => {
    if (!source.url || seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  }).slice(0, 20);
}

export function extractGeminiText(payload) {
  return payload?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim() || null;
}

async function callGemini(messages, maxTokens = 900) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const system = messages.find(message => message.role === "system")?.content;
  const contents = messages.filter(message => message.role !== "system").map(message => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] }));
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), contents, generationConfig: { maxOutputTokens: maxTokens, temperature: 0.25 } }),
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

export async function synthesizePersona(messages, maxTokens = 900) {
  return (await callGemini(messages, maxTokens)) || (await callOpenAiCompatible(messages, maxTokens));
}

export async function researchPersona(persona, question) {
  const sources = await discoverResearchSources(question);
  const sourceList = sources.map((source, index) => `[${index + 1}] ${source.title}\n${source.url}\n${source.excerpt}`).join("\n\n");
  const summary = await synthesizePersona([
    { role: "system", content: `${persona.operatingInstructions} Write a concise research synthesis. Cite only the supplied source list using [n] markers. Do not invent facts or citations. State uncertainty and source-quality limitations.` },
    { role: "user", content: `Question: ${question}\n\nPublic source list:\n${sourceList || "No sources were returned."}` },
  ]) || (sources.length ? `Public source bundle collected for **${question}**. Configure GEMINI_API_KEY to synthesize findings; QB-000 can review the cited sources now.` : `No public sources were returned for **${question}**. Retry when the search endpoint is available.`);
  return { id: crypto.randomUUID(), personaId: persona.id, role: persona.role, question, summary, sources, status: "draft", createdAt: new Date().toISOString() };
}

export async function answerPersona(persona, prompt, memoryContext = "") {
  const answer = await synthesizePersona([
    { role: "system", content: `${persona.operatingInstructions} Answer in the scope of your role. Be concise. When current evidence is needed, direct the user to /research rather than asserting unsourced facts. Do not provide individualized legal, tax, medical, or investment advice. Use supplied vetted memory only as contextual material, and clearly distinguish it from fresh evidence.` },
    { role: "user", content: `Question: ${prompt}\n\nVetted shared memory:\n${memoryContext || "No vetted shared memory was supplied."}` },
  ]);
  return answer || `${persona.id} is ready, but GEMINI_API_KEY is not configured. Use /research for a cited public-source bundle or add a Gemini API key for role-specific synthesis.`;
}
