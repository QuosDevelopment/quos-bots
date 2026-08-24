# QUOS GitHub Pages dashboard

This directory is a **static GitHub Pages dashboard** for all 101 QUOS personas. It displays a dark blue-and-black glass interface, the latest Firebase-backed operational status, a sanitized task timeline, a verified earnings ledger, and authenticated controls for task assignment and reversible bot pausing.

For local testing, serve this directory through an HTTP server. Browser module imports are intentionally not expected to load from a `file://` URL, whereas GitHub Pages serves them over HTTPS.

> **Static availability is not bot availability.** GitHub Pages can serve this frontend without a running backend, but the Discord Gateway and Gemini response logic remain in the separate Replit runtime. A free Replit runtime can still sleep, restart, or exhaust its provider allowance.

## Configure Firebase web access

Create a Firebase Web app and copy its web configuration into `firebase-config.js`. Firebase documents that the web configuration object initializes a browser client; it is not a Firebase Admin service-account credential. Never add `FIREBASE_SERVICE_ACCOUNT_JSON_B64`, a Discord token, a Gemini key, or an operator password anywhere in this directory.

Enable **Google** under Firebase Authentication’s Sign-in method. Then deploy `firebase/github-pages.firestore.rules` to the same Firestore database. The rules intentionally expose only sanitized persona profiles, aggregate runtime metadata, and the `publicTasks` and `publicEarnings` subcollections. Raw research, reports, task briefs, private earnings notes, Discord credentials, and Gemini credentials remain unavailable to the static dashboard.

## Create the first dashboard operator

After signing in to the GitHub Pages dashboard with Google, locate the user’s UID in Firebase Authentication. In Firestore, create `dashboardOperators/<UID>` with this exact document body:

```json
{ "enabled": true }
```

This manual Firebase Console step is deliberate. Browser clients cannot grant themselves operator status under the provided rules. An enabled operator can create a queue record through **Assign task** and set a persona to `paused` or `active` with the **Kill bot** button. “Kill bot” is a reversible pause: it stops new Discord commands for that persona when the Replit runtime next refreshes Firebase controls; it does not delete a persona, its knowledge, or its channel.

## Publish with GitHub Pages

The repository includes `.github/workflows/deploy-quos-dashboard.yml`. In the GitHub repository, open **Settings → Pages**, select **GitHub Actions** as the build source, then push the workflow. The action regenerates `personas.js` from the canonical roster and deploys the `github-pages-dashboard/` artifact.

GitHub Pages content is publicly reachable. If the repository uses GitHub Free, GitHub documents that the repository must be public for Pages publication. Treat this dashboard as public operational telemetry and avoid inserting private information into the records it displays.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `active` | The Replit runtime recorded completed persona work. |
| `working` | The runtime has recorded active work but not a final outcome. |
| `idle` or `unreported` | No current runtime activity record has been received. |
| `paused` | An authenticated operator requested a reversible pause. |
| `attention` | The runtime recorded a failed work outcome. |

## References

1. [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
2. [GitHub Pages site creation and visibility](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
3. [Firebase Web SDK setup](https://firebase.google.com/docs/web/setup)
4. [Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/get-started)
