import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function nonAdminContext(): TrpcContext {
  return {
    user: {
      id: 2,
      openId: "non-admin-user",
      email: "viewer@example.com",
      name: "Viewer",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("dashboard knowledge oversight access", () => {
  it("blocks non-administrators before any dashboard knowledge query is run", async () => {
    const caller = appRouter.createCaller(nonAdminContext());
    await expect(caller.dashboard.sources()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
