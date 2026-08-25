import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("GitHub Pages dashboard authentication", () => {
  it("uses a redirect-safe Google sign-in flow and restores redirect results", async () => {
    const source = await readFile(new URL("../github-pages-dashboard/app.js", import.meta.url), "utf8");
    const document = await readFile(new URL("../github-pages-dashboard/index.html", import.meta.url), "utf8");
    expect(source).toContain("signInWithRedirect");
    expect(source).toContain("signInWithEmailAndPassword");
    expect(source).toContain("getRedirectResult(auth)");
    expect(source).not.toContain("signInWithPopup");
    expect(document).toMatch(/src="app\.js\?v=[^"]+"/);
    expect(document).toContain('id="operatorPassword"');
  });

  it("keeps browser Gemini assistance session-scoped and exposes local brain export", async () => {
    const source = await readFile(new URL("../github-pages-dashboard/app.js", import.meta.url), "utf8");
    const document = await readFile(new URL("../github-pages-dashboard/index.html", import.meta.url), "utf8");
    expect(source).toContain('state.geminiKey = ""');
    expect(source).toContain("brain.jsonl");
    expect(source).toContain("browserGemini");
    expect(source).not.toContain("GEMINI_API_KEY");
    expect(document).toContain('id="brainExport"');
    expect(document).toContain('id="geminiKey"');
  });

  it("stores sanitized task projections separately from operator-only brain records", async () => {
    const source = await readFile(new URL("../github-pages-dashboard/app.js", import.meta.url), "utf8");
    const rules = await readFile(new URL("../firebase/github-pages.firestore.rules", import.meta.url), "utf8");
    expect(source).toContain('"browserTasks", task.id');
    expect(source).toContain('"browserBrain", brainEntry.id');
    expect(source).toContain('fb.collection(db, "browserTasks")');
    expect(source).toContain('fb.collection(db, "browserBotStatuses")');
    expect(rules).toContain("match /browserTasks/{id}");
    expect(rules).toContain("match /browserBrain/{id}");
    expect(rules).toContain("allow read, create: if operator()");
    expect(rules).toContain("match /browserEarnings/{id}");
    expect(source).toContain("recordEarning");
  });
});
