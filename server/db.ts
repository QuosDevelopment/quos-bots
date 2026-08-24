import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  channelProvisioning,
  discordConfiguration,
  InsertUser,
  knowledgeItems,
  knowledgeSources,
  personaActivities,
  personas,
  reports,
  researchRuns,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";
import { buildCoordinatorReport, filterKnowledgeForRequester } from "./domainContracts";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listPersonas() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(personas).orderBy(personas.id);
}

export async function getDashboardSnapshot() {
  const db = await getDb();
  if (!db) {
    return { personas: [], channels: [], reports: [], knowledge: [], research: [], configuration: undefined };
  }

  const [personaRows, channelRows, reportRows, knowledgeRows, researchRows, configurationRows] = await Promise.all([
    db.select().from(personas).orderBy(personas.id),
    db.select().from(channelProvisioning).orderBy(channelProvisioning.personaId),
    db.select().from(reports).orderBy(desc(reports.createdAt)).limit(12),
    db.select().from(knowledgeItems).orderBy(desc(knowledgeItems.createdAt)).limit(12),
    db.select().from(researchRuns).orderBy(desc(researchRuns.createdAt)).limit(12),
    db.select().from(discordConfiguration).where(eq(discordConfiguration.id, "primary")).limit(1),
  ]);

  return {
    personas: personaRows,
    channels: channelRows,
    reports: reportRows,
    knowledge: knowledgeRows,
    research: researchRows,
    configuration: configurationRows[0],
  };
}

export async function listKnowledge(personaId?: string) {
  const db = await getDb();
  if (!db) return [];
  const query = db.select().from(knowledgeItems).orderBy(desc(knowledgeItems.createdAt)).limit(50);
  return personaId ? query.where(eq(knowledgeItems.personaId, personaId)) : query;
}

export async function listSources() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(knowledgeSources).orderBy(desc(knowledgeSources.fetchedAt)).limit(50);
}

export async function retrieveSharedKnowledge(personaId: string, query: string) {
  const db = await getDb();
  if (!db) return [];
  const cleanQuery = query.trim().slice(0, 120);
  const matches = cleanQuery
    ? await db
      .select()
      .from(knowledgeItems)
      .where(and(
        eq(knowledgeItems.status, "published"),
        or(like(knowledgeItems.title, `%${cleanQuery}%`), like(knowledgeItems.summary, `%${cleanQuery}%`)),
      ))
      .orderBy(desc(knowledgeItems.createdAt))
      .limit(5)
    : await db
      .select()
      .from(knowledgeItems)
      .where(eq(knowledgeItems.status, "published"))
      .orderBy(desc(knowledgeItems.createdAt))
      .limit(5);

  const accessibleMatches = filterKnowledgeForRequester(personaId, matches);
  for (const match of accessibleMatches) {
    await db
      .update(knowledgeItems)
      .set({ reuseCount: sql`${knowledgeItems.reuseCount} + 1` })
      .where(eq(knowledgeItems.id, match.id));
  }
  await recordActivity({
    personaId,
    eventType: "knowledge_retrieval",
    summary: `${personaId} retrieved ${accessibleMatches.length} published shared knowledge item(s).`,
    metadata: { query: cleanQuery, knowledgeIds: accessibleMatches.map(match => match.id) },
  });
  return accessibleMatches;
}

export async function recordActivity(input: {
  personaId: string;
  eventType: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(personaActivities).values({
    personaId: input.personaId,
    eventType: input.eventType,
    summary: input.summary,
    metadataJson: JSON.stringify(input.metadata ?? {}),
  });
}

export async function recordReport(input: {
  personaId: string;
  kind: "activity" | "research" | "escalation" | "system";
  severity: "info" | "watch" | "high" | "critical";
  title: string;
  summary: string;
  payload?: Record<string, unknown>;
}) {
  const db = await getDb();
  if (!db) return;
  const coordinatorReport = buildCoordinatorReport(input);
  await db.insert(reports).values({
    personaId: input.personaId,
    kind: input.kind,
    severity: input.severity,
    title: input.title,
    summary: input.summary,
    payloadJson: JSON.stringify({
      ...(input.payload ?? {}),
      coordinatorDelivery: {
        targetPersonaId: coordinatorReport.targetPersonaId,
        sourcePersonaId: coordinatorReport.sourcePersonaId,
        kind: coordinatorReport.kind,
        severity: coordinatorReport.severity,
      },
    }),
  });
}

export async function updateDiscordConfiguration(input: Partial<typeof discordConfiguration.$inferInsert>) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(discordConfiguration)
    .values({ id: "primary", ...input })
    .onDuplicateKeyUpdate({ set: input });
}

export async function updateChannelProvisioning(
  personaId: string,
  input: Partial<typeof channelProvisioning.$inferInsert>,
) {
  const db = await getDb();
  if (!db) return;
  await db.update(channelProvisioning).set(input).where(eq(channelProvisioning.personaId, personaId));
}
