# QUOS Bots free-tier constraints

The requested Replit, Render, Firebase, Gemini API, and Netlify stack can be assembled on no-cost tiers for testing or low-volume use, but it cannot truthfully promise uninterrupted zero-cost Discord availability. The architecture must degrade safely when a host sleeps, quotas are reached, or a provider restarts its service.

| Platform | Zero-cost capability | Critical constraint for QUOS Bots |
| --- | --- | --- |
| Replit | Starter includes one published app; static publishing and limited credits are available. | Replit documents Reserved VM as the deployment type for chat bots that must remain connected; it has a fixed monthly cost. Autoscale can scale to zero, and scheduled runs stop after each task. |
| Render | Free web services, static sites, and limited datastore offerings. | A free web service spins down after 15 minutes without inbound traffic, takes about one minute to wake, loses local files on restart/spin-down, and may be restarted. It cannot be relied on for a persistent Discord Gateway. |
| Firebase Firestore | Spark/no-cost Firestore supports one free database per project. | The free quota is 1 GiB stored data, 50,000 document reads/day, 20,000 writes/day, 20,000 deletes/day, and 10 GiB monthly outbound transfer. Quota overruns require billing. |
| Gemini Developer API | Selected models expose free input/output tokens and Google AI Studio access. | Free-tier model availability and API limits vary; limits are applied per project across requests/minute, tokens/minute, and requests/day. Submitted content can be used to improve Google products on the free tier. |
| Netlify | Free plan supplies 300 credits with static deployment, CDN, custom domains, and limited functions. | Credits are hard-limited, and production deploys, bandwidth, compute, and requests consume credits. The frontend should remain static and use Firebase/Render APIs sparingly. |

## Architecture decision

The Replit bot core will use one Discord Gateway only while its process is awake. Firebase Firestore is the durable system of record for personas, knowledge, task history, status, and earnings. The Render dashboard and Netlify static frontend are read-optimized consumers of Firebase data. Gemini is a rate-limited optional synthesis provider; source-grounded research remains citation-first and must handle model unavailability gracefully.

## Sources

1. [Replit deployment types](https://docs.replit.com/features/publishing/deployment-types)
2. [Replit publishing costs](https://docs.replit.com/billing/deployment-pricing)
3. [Render free instances](https://render.com/docs/free)
4. [Firebase Firestore usage and limits](https://firebase.google.com/docs/firestore/quotas)
5. [Firebase pricing](https://firebase.google.com/pricing)
6. [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
7. [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)
8. [Netlify pricing](https://www.netlify.com/pricing/)
