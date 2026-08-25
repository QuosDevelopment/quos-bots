# QUOS GitHub Pages browser workspace

This directory is an **authentication-free GitHub Pages browser workspace** for all 101 QUOS personas. It presents the dark blue-and-black control grid, read-only sanitized Firebase task history and earnings, reversible local persona pauses, browser-session task execution, and a local `brain.jsonl` export. It uses **no Discord Gateway, Replit runtime, Render service, continuously running worker, Google sign-in, or Email/Password sign-in**.

> **Execution boundary.** GitHub Pages can serve the interface when a visitor opens it, but QB-001–QB-101 only perform work while that browser tab remains open. Closing the tab ends task processing; it does not create a background bot or scheduled worker.

## Browser Gemini workflow

A visitor selects **Assign task**, enters a task brief, and enters a Gemini key for that single task. The browser collects public web, Google News, and Wikipedia search links, then sends the role-scoped task and source bundle to Gemini. The dashboard clears the key from memory after the request and does not write it to Firebase, browser storage, GitHub, or exported `brain.jsonl`.

Because a static site cannot protect a server credential, do **not** hardcode `GEMINI_API_KEY` in `firebase-config.js`, `app.js`, repository variables, or a GitHub secret intended for Pages. Use a browser-restricted Gemini key, enter it only when you run a task, and apply the provider restrictions appropriate to a public browser client.

## Brain memory and task data

Every completed browser task is retained locally in the browser’s storage as a detailed local record. Select **Export brain.jsonl** to download an append-only JSON Lines file containing local task records, source links, and responses. The browser reads only pre-existing sanitized Firebase data and never writes task, status, earnings, brain, or control records. This avoids exposing an unauthenticated public write path.

| Collection | Browser access | Content |
| --- | --- | --- |
| `browserTasks` | Public read; no browser writes | Pre-existing sanitized persona ID, task title, status, and source count. No full Gemini answer or API key. |
| `browserBotStatuses` | Public read; no browser writes | Pre-existing `active`, `working`, `idle`, or `attention` states. |
| `browserEarnings` | Public read; no browser writes | Pre-existing verified USD amount, persona ID, and a short public accounting note. |
| `browserBrain` | No browser access | Private detailed task responses and source links are not synchronized by this public workspace. |
| `dashboardControls` | Public read; no browser writes | Existing control records, while browser-local pauses reset when the tab closes. |

## Configure Firebase web access

Copy the Firebase Web app configuration into `firebase-config.js`. Firebase’s web configuration initializes the browser client; it is not a Firebase Admin credential. The dashboard does not use Firebase Authentication. Never add a service-account JSON document, Discord token, Gemini key, or password anywhere in this directory.[3]

Deploy the complete `firebase/github-pages.firestore.rules` file to the same Firestore database **before** using the browser workspace. The rules expose only sanitized public projections and deny every browser write, including task, brain, status, earnings, and control writes. The workspace keeps its own tasks and pause state in the active browser tab.[4]

## Publish with GitHub Pages

The repository includes `.github/workflows/deploy-quos-dashboard.yml`. In the GitHub repository, open **Settings → Pages**, choose **GitHub Actions** as the source, and push the workflow. The workflow regenerates `personas.js` from the canonical roster and deploys the `github-pages-dashboard/` artifact.[1]

GitHub Pages content is publicly reachable. Keep private task answers and credentials out of public collections. If the repository uses GitHub Free, the repository must be public for Pages publication.[2]

## Status vocabulary

| Status | Meaning in the browser workspace |
| --- | --- |
| `active` | A browser task finished successfully in the current open tab. |
| `working` | The current browser is collecting sources or generating a response. |
| `idle` | The browser has no active task for the persona. |
| `paused` | The current browser set a reversible local pause. |
| `attention` | The latest browser task encountered an error. |

## References

1. [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
2. [GitHub Pages site creation and visibility](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
3. [Firebase Web SDK setup](https://firebase.google.com/docs/web/setup)
4. [Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
