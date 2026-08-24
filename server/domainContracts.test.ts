import { describe, expect, it } from "vitest";
import { PERSONAS, QB000 } from "../shared/personas";
import {
  DISCORD_COMMAND_NAMES,
  buildChannelProvisioningPlan,
  buildCoordinatorReport,
  canPersonaAccessKnowledge,
  canPublishKnowledge,
  filterKnowledgeForRequester,
  formatKnowledgeAttribution,
  resolvePersonaCommandRoute,
} from "./domainContracts";

describe("QUOS Bots roster integrity", () => {
  it("contains QB-000 plus a complete, unique QB-001–QB-101 roster", () => {
    expect(PERSONAS).toHaveLength(102);
    expect(PERSONAS.map(persona => persona.id)).toEqual(["QB-000", ...Array.from({ length: 101 }, (_, index) => `QB-${String(index + 1).padStart(3, "0")}`)]);
    expect(new Set(PERSONAS.map(persona => persona.role)).size).toBe(102);
    expect(PERSONAS.every(persona => persona.operatingInstructions.length > 80 && persona.commands.length === 4)).toBe(true);
  });
});

describe("Discord provisioning and command contracts", () => {
  it("uses one compact command surface and unique dedicated channel plans", () => {
    expect(DISCORD_COMMAND_NAMES).toEqual(["qb", "research", "knowledge", "status", "report"]);
    const plans = PERSONAS.map(buildChannelProvisioningPlan);
    expect(new Set(plans.map(plan => plan.channelName)).size).toBe(102);
    expect(buildChannelProvisioningPlan(QB000)).toMatchObject({ categoryName: "QUOS · Coordination", channelName: "qb-000-coordinator" });
  });

  it("routes a Discord command only when its guild and dedicated persona channel are valid", () => {
    expect(resolvePersonaCommandRoute({ interactionGuildId: "guild-1", configuredGuildId: "guild-1", channelPersonaId: "QB-034" })).toEqual({ allowed: true, personaId: "QB-034" });
    expect(resolvePersonaCommandRoute({ interactionGuildId: "guild-2", configuredGuildId: "guild-1", channelPersonaId: "QB-034" })).toEqual({ allowed: false, reason: "wrong_guild" });
    expect(resolvePersonaCommandRoute({ interactionGuildId: "guild-1", configuredGuildId: "guild-1", channelPersonaId: undefined })).toEqual({ allowed: false, reason: "unprovisioned_channel" });
  });
});

describe("knowledge publication and QB-000 reporting", () => {
  it("requires a vetted source before shared knowledge can be published", () => {
    expect(canPublishKnowledge(null, undefined)).toBe(false);
    expect(canPublishKnowledge(14, "pending")).toBe(false);
    expect(canPublishKnowledge(14, "rejected")).toBe(false);
    expect(canPublishKnowledge(14, "vetted")).toBe(true);
  });

  it("allows cross-persona reuse only after publication and preserves source attribution", () => {
    expect(canPersonaAccessKnowledge({ requesterPersonaId: "QB-001", ownerPersonaId: "QB-002", status: "draft" })).toBe(false);
    expect(canPersonaAccessKnowledge({ requesterPersonaId: "QB-000", ownerPersonaId: "QB-002", status: "draft" })).toBe(true);
    expect(canPersonaAccessKnowledge({ requesterPersonaId: "QB-001", ownerPersonaId: "QB-002", status: "published" })).toBe(true);
    const attributed = formatKnowledgeAttribution({
      title: "Evaluation methods",
      summary: "A traceable test summary.",
      personaId: "QB-010",
      citationsJson: JSON.stringify([{ title: "Official guide", url: "https://example.org/guide" }]),
    });
    expect(attributed).toContain("Published by QB-010");
    expect(attributed).toContain("https://example.org/guide");
  });

  it("filters runtime knowledge retrieval so draft work cannot leak across personas", () => {
    const accessible = filterKnowledgeForRequester("QB-001", [
      { id: 1, personaId: "QB-001", status: "draft" as const },
      { id: 2, personaId: "QB-002", status: "draft" as const },
      { id: 3, personaId: "QB-003", status: "published" as const },
    ]);
    expect(accessible.map(item => item.id)).toEqual([1, 3]);
  });

  it("routes each structured report to QB-000 while preserving its source persona", () => {
    expect(buildCoordinatorReport({
      personaId: "QB-065",
      kind: "escalation",
      severity: "high",
      title: "Safety review required",
      summary: "A release blocker needs coordination.",
    })).toMatchObject({ targetPersonaId: "QB-000", sourcePersonaId: "QB-065", kind: "escalation", severity: "high" });
  });
});
