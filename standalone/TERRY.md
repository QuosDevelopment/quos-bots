# Terry intelligence runtime

**Terry** is the human-readable name for **QB-000**, the QUOS coordinator. Terry is not a second Discord application or an autonomous agent with unrestricted authority. The runtime remains **one Discord application, one token, one Gateway**, with QB-001 through QB-101 selected by their existing channels and roles.

| Capability | Runtime behavior | Boundary |
| --- | --- | --- |
| English questions | `/qb` sends the channel persona’s role instructions, the user prompt, and relevant vetted memory to Gemini. | The response is role-scoped and does not substitute for professional legal, tax, medical, or investment advice. |
| Assigned tasks | An authenticated dashboard task triggers at most five Terry learning cycles. Each cycle collects public-source metadata, asks Gemini for a cited improvement, and retains the result. | The process only proposes or reports work. It does not purchase, post externally, change accounts, or perform other irreversible actions. |
| Research | The runtime combines public web RSS, Wikipedia search results, Google News RSS, and YouTube metadata/search links. A separately configured Google Programmable Search credential can add Google web-result metadata. | A citation points to collected metadata; it does not claim that the runtime read an entire article or watched a full video. |
| Memory | Each learning cycle, conversation, research result, completion, or failure is appended to `brain.jsonl`. Configured Firebase state also receives the brain collection. | `brain.jsonl` and private Firebase collections must never be placed in GitHub Pages or Discord public output. |
| Knowledge sharing | Successful assigned-task results are stored as source-attributed shared QUOS knowledge and reported to QB-000. | Dashboard public reads remain limited to sanitized status, task, and earning projections. |

## Five-cycle task sequence

For a dashboard assignment, the selected persona runs a bounded sequence: it interprets the English task in its own role, collects a public-source bundle, synthesizes an improved answer with source markers, retains a timestamped cycle record, and repeats until it reaches the configured limit. The default is five cycles and the implementation clamps the configuration to a maximum of five so that an assignment cannot create unbounded model calls.

The final task result, its source URLs, and every intermediate cycle are reported to Terry/QB-000. The result is stored in the persona’s channel as a concise completion message and in private runtime memory for continuity. The runtime must be awake to process a task; a free host may sleep, so task execution and Discord responsiveness are not a guarantee of continuous availability.

## Secret configuration

Set `GEMINI_API_KEY` through the host’s private secret manager. The GitHub Pages site contains only Firebase’s public web configuration and must never receive the Gemini key. For Replit deployment, add the same variable in **Replit Secrets** before starting the portable runtime. Optional Google and YouTube search credentials are separate values and are not required for the base cited-source path.
