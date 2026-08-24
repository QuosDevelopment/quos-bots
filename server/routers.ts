import { z } from "zod";
import { eq } from "drizzle-orm";
import { knowledgeItems, knowledgeSources, reports } from "../drizzle/schema";
import { getDashboardSnapshot, getDb, listKnowledge, listSources, recordReport } from "./db";
import { bootstrapPersonaChannels, getDiscordRuntimeStatus, resyncDiscordCommands } from "./discordBot";
import { canPublishKnowledge } from "./domainContracts";
import { ensurePersonaRoster } from "./personaSeed";
import { runGroundedResearch } from "./research";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, router } from "./_core/trpc";

const personaIdSchema = z.string().regex(/^QB-(0\d\d|10[01])$/);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  dashboard: router({
    snapshot: adminProcedure.query(async () => {
      await ensurePersonaRoster();
      const snapshot = await getDashboardSnapshot();
      return { ...snapshot, runtime: getDiscordRuntimeStatus() };
    }),
    knowledge: adminProcedure
      .input(z.object({ personaId: personaIdSchema.optional() }).optional())
      .query(async ({ input }) => listKnowledge(input?.personaId)),
    sources: adminProcedure.query(async () => listSources()),
  }),
  operations: router({
    research: adminProcedure
      .input(z.object({ personaId: personaIdSchema, question: z.string().min(8).max(600) }))
      .mutation(async ({ input }) => runGroundedResearch(input.personaId, input.question)),
    bootstrapChannels: adminProcedure.mutation(async () => bootstrapPersonaChannels()),
    syncCommands: adminProcedure.mutation(async () => resyncDiscordCommands()),
    vetSource: adminProcedure
      .input(z.object({ sourceId: z.number().int().positive(), approved: z.boolean(), qualityScore: z.number().int().min(0).max(100) }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database is unavailable.");
        await db.update(knowledgeSources).set({
          vettingStatus: input.approved ? "vetted" : "rejected",
          qualityScore: input.qualityScore,
          reviewedBy: "QB-000",
          reviewedAt: new Date(),
        }).where(eq(knowledgeSources.id, input.sourceId));
        return { success: true };
      }),
    publishKnowledge: adminProcedure
      .input(z.object({ knowledgeId: z.number().int().positive() }))
      .mutation(async ({ input }) => {
        const db = await getDb();
        if (!db) throw new Error("Database is unavailable.");
        const knowledge = await db.select().from(knowledgeItems).where(eq(knowledgeItems.id, input.knowledgeId)).limit(1);
        if (!knowledge[0]) throw new Error("Knowledge item not found.");
        const source = knowledge[0].sourceId
          ? await db.select().from(knowledgeSources).where(eq(knowledgeSources.id, knowledge[0].sourceId)).limit(1)
          : [];
        if (!canPublishKnowledge(knowledge[0].sourceId, source[0]?.vettingStatus)) {
          throw new Error("Knowledge cannot be published until QB-000 has vetted its primary source.");
        }
        await db.update(knowledgeItems).set({ status: "published" }).where(eq(knowledgeItems.id, input.knowledgeId));
        await recordReport({
          personaId: "QB-000",
          kind: "activity",
          severity: "info",
          title: "Knowledge published to the shared hub",
          summary: knowledge[0].title,
          payload: { knowledgeId: input.knowledgeId },
        });
        return { success: true };
      }),
    report: adminProcedure
      .input(z.object({ personaId: personaIdSchema, title: z.string().min(3).max(512), summary: z.string().min(3).max(4000), severity: z.enum(["info", "watch", "high", "critical"]) }))
      .mutation(async ({ input }) => {
        await recordReport({ personaId: input.personaId, kind: "escalation", severity: input.severity, title: input.title, summary: input.summary });
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
