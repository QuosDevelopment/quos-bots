import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("GitHub Pages dashboard authentication", () => {
  it("uses a redirect-safe Google sign-in flow and restores redirect results", async () => {
    const source = await readFile(new URL("../github-pages-dashboard/app.js", import.meta.url), "utf8");
    expect(source).toContain("signInWithRedirect");
    expect(source).toContain("getRedirectResult(auth)");
    expect(source).not.toContain("signInWithPopup");
  });
});
