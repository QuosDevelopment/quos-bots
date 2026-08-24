import { PersonaDefinition, QB000 } from "../shared/personas";

export const DISCORD_COMMAND_NAMES = ["qb", "research", "knowledge", "status", "report"] as const;

export function buildChannelProvisioningPlan(persona: PersonaDefinition) {
  return {
    personaId: persona.id,
    categoryName: `QUOS · ${persona.group}`,
    channelName: persona.id === QB000.id ? "qb-000-coordinator" : persona.channelSlug,
  };
}

export function canPublishKnowledge(sourceId: number | null, vettingStatus: "pending" | "vetted" | "rejected" | undefined) {
  return Boolean(sourceId && vettingStatus === "vetted");
}

export function canPersonaAccessKnowledge(input: {
  requesterPersonaId: string;
  ownerPersonaId: string;
  status: "draft" | "published" | "superseded";
}) {
  return input.status === "published"
    || input.requesterPersonaId === QB000.id
    || input.requesterPersonaId === input.ownerPersonaId;
}

export function filterKnowledgeForRequester<T extends { personaId: string; status: "draft" | "published" | "superseded" }>(
  requesterPersonaId: string,
  items: T[],
) {
  return items.filter(item => canPersonaAccessKnowledge({
    requesterPersonaId,
    ownerPersonaId: item.personaId,
    status: item.status,
  }));
}

export function resolvePersonaCommandRoute(input: {
  interactionGuildId: string | null;
  configuredGuildId: string | undefined;
  channelPersonaId: string | undefined;
}) {
  if (!input.configuredGuildId || input.interactionGuildId !== input.configuredGuildId) {
    return { allowed: false as const, reason: "wrong_guild" as const };
  }
  if (!input.channelPersonaId) {
    return { allowed: false as const, reason: "unprovisioned_channel" as const };
  }
  return { allowed: true as const, personaId: input.channelPersonaId };
}

export function formatKnowledgeAttribution(input: {
  title: string;
  summary: string;
  personaId: string;
  citationsJson: string;
}) {
  let citations: Array<{ title?: string; url?: string }> = [];
  try {
    citations = JSON.parse(input.citationsJson) as Array<{ title?: string; url?: string }>;
  } catch {
    citations = [];
  }
  const citation = citations[0]?.url ? ` [source](${citations[0].url})` : "";
  return `**${input.title}** — ${input.summary}\n*Published by ${input.personaId}.*${citation}`;
}

export function buildCoordinatorReport(input: {
  personaId: string;
  kind: "activity" | "research" | "escalation" | "system";
  severity: "info" | "watch" | "high" | "critical";
  title: string;
  summary: string;
}) {
  return {
    targetPersonaId: QB000.id,
    sourcePersonaId: input.personaId,
    kind: input.kind,
    severity: input.severity,
    title: input.title,
    summary: input.summary,
  };
}
