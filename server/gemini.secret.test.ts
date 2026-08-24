import { describe, expect, it } from "vitest";

describe("Gemini server credential", () => {
  it("authenticates against the lightweight models endpoint without exposing the key", async () => {
    const key = process.env.GEMINI_API_KEY;
    expect(key, "GEMINI_API_KEY must be configured through the private secret field").toBeTruthy();

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key!)}`, {
      signal: AbortSignal.timeout(20_000),
    });
    expect(response.ok, `Gemini models endpoint returned HTTP ${response.status}`).toBe(true);
    const payload = await response.json() as { models?: unknown[] };
    expect(Array.isArray(payload.models)).toBe(true);
  }, 30_000);
});
