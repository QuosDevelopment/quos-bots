# QUOS Bots zero-cost-tier deployment map

QUOS Bots uses **one Discord application and one Gateway client**. The Gateway runtime belongs on Replit while it is awake. It persists all shared state through Firebase Firestore, calls Gemini only from the bot backend, and exposes the protected operations dashboard through Render. Netlify hosts only the static frontend and does not receive any Discord, Firebase Admin, or Gemini secret.

| Component | Directory | Required private settings | Public responsibility |
| --- | --- | --- | --- |
| Replit bot core | `standalone/` | Discord values, Firebase service account, Gemini API key, dashboard credentials | Persona commands, cited research, shared knowledge, task and earnings records. |
| Firebase | `firebase/` and `standalone/firebase/` | Firebase project and service-account JSON | Durable record for 101 persona profiles, channels, tasks, research, reports, earnings, and health. |
| Render dashboard | `deployments/render-dashboard/` | Firebase service-account JSON and dashboard credentials | Authenticated view of real persisted bot status, task history, and earnings ledger. |
| Netlify frontend | `deployments/netlify-frontend/` | No secrets | Static QUOS presence page and link to the protected dashboard. |

## Replit bot core

Import this repository into Replit, select Node.js 20+, and use the existing `.replit` run command. Add the variables in `standalone/CONFIGURATION.md` under **Secrets**, then run `npm run bootstrap` once only if the Discord channels are absent. The bot registers `/status`, `/qb`, `/research`, `/knowledge`, `/report`, `/vet`, and `/earning` after it connects.

Replit documents its Reserved VM type as the intended option for chat bots that must remain connected. The free/credit-backed options can stop, so this installation is a development or low-volume system rather than a no-cost 24/7 service.

## Firebase

Create a Firebase project on the Spark plan, create a Firestore database, and deploy `standalone/firebase/firestore.rules`. Generate a service account key through Firebase or Google Cloud, base64-encode its JSON locally, and add the resulting text as `FIREBASE_SERVICE_ACCOUNT_JSON_B64` in Replit and Render. Do not put the JSON key in this repository, Netlify, or a browser client.

## Render dashboard

In Render, create a Blueprint from the repository root. The root `render.yaml` creates only the dashboard service with `plan: free`. Enter `FIREBASE_SERVICE_ACCOUNT_JSON_B64`, `DASHBOARD_USERNAME`, and `DASHBOARD_PASSWORD` in Render’s protected environment fields. The dashboard reads Firebase state but never exposes the service account to the browser.

## Netlify static frontend

Create a Netlify site from the repository root. Netlify reads the root `netlify.toml`, which publishes `deployments/netlify-frontend`. After Render provides the dashboard URL, set it in `deployments/netlify-frontend/config.js` before deploying. The static site has no backend and cannot wake or keep the Discord bot online.

## Zero-cost boundary

The plan has no required paid subscription while usage stays within the providers’ current free limits. It does **not** mean perpetual, guaranteed, or unlimited hosting. Refer to `standalone/FREE_TIER_CONSTRAINTS.md` for source-linked quotas and sleep behavior.
