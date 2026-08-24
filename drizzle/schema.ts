import { index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const personas = mysqlTable("personas", {
  id: varchar("id", { length: 8 }).primaryKey(),
  name: varchar("name", { length: 32 }).notNull().unique(),
  role: varchar("role", { length: 128 }).notNull(),
  group: varchar("group", { length: 64 }).notNull(),
  channelSlug: varchar("channelSlug", { length: 100 }).notNull().unique(),
  operatingInstructions: text("operatingInstructions").notNull(),
  commandsJson: text("commandsJson").notNull(),
  status: mysqlEnum("status", ["ready", "learning", "offline", "attention"]).default("ready").notNull(),
  channelId: varchar("channelId", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const discordConfiguration = mysqlTable("discordConfiguration", {
  id: varchar("id", { length: 32 }).primaryKey(),
  guildId: varchar("guildId", { length: 32 }),
  applicationId: varchar("applicationId", { length: 32 }),
  gatewayStatus: mysqlEnum("gatewayStatus", ["not_configured", "connecting", "connected", "degraded", "offline"]).default("not_configured").notNull(),
  channelBootstrapStatus: mysqlEnum("channelBootstrapStatus", ["not_started", "ready", "running", "blocked", "failed"]).default("not_started").notNull(),
  lastGatewayHeartbeatAt: timestamp("lastGatewayHeartbeatAt"),
  lastCommandSyncAt: timestamp("lastCommandSyncAt"),
  lastError: text("lastError"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const channelProvisioning = mysqlTable("channelProvisioning", {
  personaId: varchar("personaId", { length: 8 }).primaryKey().references(() => personas.id, { onDelete: "cascade" }),
  categoryName: varchar("categoryName", { length: 64 }).notNull(),
  discordCategoryId: varchar("discordCategoryId", { length: 32 }),
  discordChannelId: varchar("discordChannelId", { length: 32 }),
  status: mysqlEnum("status", ["pending", "creating", "ready", "blocked", "failed"]).default("pending").notNull(),
  attempts: int("attempts").default(0).notNull(),
  lastError: text("lastError"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const knowledgeSources = mysqlTable("knowledgeSources", {
  id: int("id").autoincrement().primaryKey(),
  url: varchar("url", { length: 2048 }).notNull().unique(),
  title: varchar("title", { length: 512 }).notNull(),
  publisher: varchar("publisher", { length: 255 }),
  sourceType: mysqlEnum("sourceType", ["official", "academic", "industry", "news", "other"]).default("other").notNull(),
  vettingStatus: mysqlEnum("vettingStatus", ["pending", "vetted", "rejected"]).default("pending").notNull(),
  qualityScore: int("qualityScore").default(0).notNull(),
  excerpt: text("excerpt"),
  contentHash: varchar("contentHash", { length: 128 }),
  reviewedBy: varchar("reviewedBy", { length: 8 }).references(() => personas.id),
  reviewedAt: timestamp("reviewedAt"),
  fetchedAt: timestamp("fetchedAt").defaultNow().notNull(),
});

export const knowledgeItems = mysqlTable("knowledgeItems", {
  id: int("id").autoincrement().primaryKey(),
  personaId: varchar("personaId", { length: 8 }).notNull().references(() => personas.id, { onDelete: "cascade" }),
  sourceId: int("sourceId").references(() => knowledgeSources.id, { onDelete: "set null" }),
  title: varchar("title", { length: 512 }).notNull(),
  summary: text("summary").notNull(),
  content: text("content").notNull(),
  tagsJson: text("tagsJson").notNull(),
  citationsJson: text("citationsJson").notNull(),
  status: mysqlEnum("status", ["draft", "published", "superseded"]).default("draft").notNull(),
  reuseCount: int("reuseCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [index("knowledge_persona_idx").on(table.personaId), index("knowledge_source_idx").on(table.sourceId)]);

export const researchRuns = mysqlTable("researchRuns", {
  id: int("id").autoincrement().primaryKey(),
  personaId: varchar("personaId", { length: 8 }).notNull().references(() => personas.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  model: varchar("model", { length: 128 }),
  status: mysqlEnum("status", ["queued", "running", "completed", "failed"]).default("queued").notNull(),
  sourcesUsed: int("sourcesUsed").default(0).notNull(),
  error: text("error"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
}, table => [index("research_persona_idx").on(table.personaId)]);

export const reports = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  personaId: varchar("personaId", { length: 8 }).notNull().references(() => personas.id, { onDelete: "cascade" }),
  kind: mysqlEnum("kind", ["activity", "research", "escalation", "system"]).notNull(),
  severity: mysqlEnum("severity", ["info", "watch", "high", "critical"]).default("info").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  summary: text("summary").notNull(),
  payloadJson: text("payloadJson").notNull(),
  acknowledgedAt: timestamp("acknowledgedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("reports_persona_idx").on(table.personaId), index("reports_created_idx").on(table.createdAt)]);

export const personaActivities = mysqlTable("personaActivities", {
  id: int("id").autoincrement().primaryKey(),
  personaId: varchar("personaId", { length: 8 }).notNull().references(() => personas.id, { onDelete: "cascade" }),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  summary: text("summary").notNull(),
  metadataJson: text("metadataJson").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [index("activity_persona_idx").on(table.personaId), index("activity_created_idx").on(table.createdAt)]);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
