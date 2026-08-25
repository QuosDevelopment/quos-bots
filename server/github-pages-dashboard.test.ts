import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("GitHub Pages dashboard public workspace", () => {
  it("removes all browser authentication and sign-in controls", async () => {
    const source = await readFile(new URL("../github-pages-dashboard/app.js", import.meta.url), "utf8");
    const document = await readFile(new URL("../github-pages-dashboard/index.html", import.meta.url), "utf8");
    expect(source).not.toContain("signInWithRedirect");
    expect(source).not.toContain("signInWithEmailAndPassword");
    expect(source).not.toContain("sendPasswordResetEmail");
    expect(source).not.toContain("firebase-auth.js");
    expect(source).not.toContain("signInWithPopup");
    expect(document).toMatch(/src="app\.js\?v=[^"]+"/);
    expect(document).not.toContain('id="operatorPassword"');
    expect(document).not.toContain('id="passwordReset"');
    expect(document).not.toContain('id="signIn"');
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

  it("keeps browser task execution local while reading sanitized public projections", async () => {
    const source = await readFile(new URL("../github-pages-dashboard/app.js", import.meta.url), "utf8");
    const rules = await readFile(new URL("../firebase/github-pages.firestore.rules", import.meta.url), "utf8");
    expect(source).toContain('fb.collection(db, "browserTasks")');
    expect(source).toContain('fb.collection(db, "browserBotStatuses")');
    expect(rules).toContain("match /browserTasks/{id}");
    expect(rules).toContain("match /browserBrain/{id}");
    expect(rules).toContain("allow read, write: if false;");
    expect(rules).toContain("match /browserEarnings/{id}");
    expect(source).not.toContain("recordEarning");
    expect(source).toContain("Completed locally");
  });
});
