import { eq } from "drizzle-orm";
import { channelProvisioning, discordConfiguration, personas } from "../drizzle/schema";
import { PERSONAS } from "../shared/personas";
import { getDb } from "./db";

export async function ensurePersonaRoster() {
  const db = await getDb();
  if (!db) return;

  await db
    .insert(personas)
    .values(
      PERSONAS.map(persona => ({
        id: persona.id,
        name: persona.name,
        role: persona.role,
        group: persona.group,
        channelSlug: persona.channelSlug,
        operatingInstructions: persona.operatingInstructions,
        commandsJson: JSON.stringify(persona.commands),
      })),
    )
    .onDuplicateKeyUpdate({ set: { updatedAt: new Date() } });

  const existingPlans = await db
    .select({ personaId: channelProvisioning.personaId })
    .from(channelProvisioning);
  const plannedPersonaIds = new Set(existingPlans.map(plan => plan.personaId));
  const missingPlans = PERSONAS.filter(persona => !plannedPersonaIds.has(persona.id));
  if (missingPlans.length > 0) {
    await db.insert(channelProvisioning).values(
      missingPlans.map(persona => ({
        personaId: persona.id,
        categoryName: persona.group,
      })),
    );
  }

  await db
    .insert(discordConfiguration)
    .values({ id: "primary" })
    .onDuplicateKeyUpdate({ set: { id: "primary" } });
}
