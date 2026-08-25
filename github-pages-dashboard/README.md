# QUOS GitHub Pages browser workspace

This directory is a **GitHub Pages-only browser workspace** for all 101 QUOS personas. It presents the dark blue-and-black control grid, sanitized Firebase task history and earnings, reversible persona pauses, browser-session task execution, and a local `brain.jsonl` export. It uses **no Discord Gateway, Replit runtime, Render service, or continuously running worker**.

> **Execution boundary.** GitHub Pages can serve the interface when a visitor opens it, but QB-001–QB-101 only perform work while an authenticated operator keeps the browser tab open. Closing the tab ends task processing; it does not create a background bot or scheduled worker.

## Browser Gemini workflow

An operator selects **Assign task**, enters a task brief, and enters a Gemini key for that single task. The browser collects public web, Google News, and Wikipedia search links, then sends the role-scoped task and source bundle to Gemini. The dashboard clears the key from memory after the request and does not write it to Firebase, browser storage, GitHub, or exported `brain.jsonl`.

Because a static site cannot protect a server credential, do **not** hardcode `GEMINI_API_KEY` in `firebase-config.js`, `app.js`, repository variables, or a GitHub secret intended for Pages. Use a browser-restricted Gemini key, enter it only when you run a task, and apply the provider restrictions appropriate to a public browser client.

## Brain memory and task data

Every completed browser task is retained locally in the browser’s storage as a detailed private record. Select **Export brain.jsonl** to download an append-only JSON Lines file containing local task records, source links, and responses. The browser sends only sanitized task history and persona status to publicly readable Firebase collections; complete task responses, source bundles, and local brain records are stored in the operator-only `browserBrain` collection when its rules are published.

| Collection | Browser access | Content |
| --- | --- | --- |
| `browserTasks` | Public read; operator create | Persona ID, task title, status, and source count. No full Gemini answer or API key. |
| `browserBotStatuses` | Public read; operator create/update | `active`, `working`, `idle`, or `attention` state for a persona. |
| `browserEarnings` | Public read; operator create | Verified USD amount, persona ID, and a short public accounting note. |
| `browserBrain` | Operator only | Detailed task response, source links, and local-memory projection. |
| `dashboardControls` | Public read; operator create/update | Reversible `paused` or `active` control records. |

## Configure Firebase web access

Copy the Firebase Web app configuration into `firebase-config.js`, then enable **Google** under Firebase Authentication’s Sign-in method. Firebase’s web configuration initializes the browser client; it is not a Firebase Admin credential. Never add a service-account JSON document, Discord token, Gemini key, or operator password anywhere in this directory.[3]

Deploy the complete `firebase/github-pages.firestore.rules` file to the same Firestore database **before** using the browser workspace. The rules expose only sanitized public projections and restrict browser task writes, brain records, and status changes to an enabled operator. The dashboard reports a Firebase write issue while still retaining the local record if the rules have not yet been published.[4]

## Create the first dashboard operator

After signing in to the dashboard with Google, locate the account UID in Firebase Authentication. In Firestore, create `dashboardOperators/<UID>` with the following document. This manual console step prevents a browser client from granting itself operator access.

```json
{ "enabled": true }
```

An enabled operator can run browser tasks and use **Kill bot** as a reversible pause. The pause prevents a browser task from starting for that persona; it does not delete a persona, its task history, or its local brain records.

The dashboard offers **Google** sign-in and an Email/Password recovery form for a Firebase Authentication user created by the project owner. The recovery form sends the credentials only to Firebase Authentication, clears the password field immediately after each attempt, and never stores it in browser storage, Firebase documents, or GitHub Pages assets.

Use **Record earning** only for an actual, verified USD ledger event. The amount and short accounting note are intentionally public dashboard data, so do not enter customer, bank, invoice, personal, or other sensitive details. The browser validates a positive amount, and the Firestore rules limit creation to enabled operators.

## Publish with GitHub Pages

The repository includes `.github/workflows/deploy-quos-dashboard.yml`. In the GitHub repository, open **Settings → Pages**, choose **GitHub Actions** as the source, and push the workflow. The workflow regenerates `personas.js` from the canonical roster and deploys the `github-pages-dashboard/` artifact.[1]

GitHub Pages content is publicly reachable. Keep private task answers and credentials out of public collections. If the repository uses GitHub Free, the repository must be public for Pages publication.[2]

## Status vocabulary

| Status | Meaning in the browser workspace |
| --- | --- |
| `active` | A browser task finished successfully in an operator’s open tab. |
| `working` | An operator’s browser is currently collecting sources or generating a response. |
| `idle` | The browser has no active task for the persona. |
| `paused` | An authenticated operator set a reversible pause. |
| `attention` | The latest browser task encountered an error. |

## References

1. [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
2. [GitHub Pages site creation and visibility](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
3. [Firebase Web SDK setup](https://firebase.google.com/docs/web/setup)
4. [Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
