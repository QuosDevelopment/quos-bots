# External Deployment Status

The portable QUOS Bots runtime, `render.yaml`, and `.replit` configuration are prepared in this repository. The Render dashboard page did not expose an authenticated deployment interface in the current browser session, so no external service can be created from this workspace without the account owner completing sign-in.

The Render workspace is now authenticated and shows an existing `quos-university` service. A new QUOS Bots Render service will require an external source connection, normally a GitHub or GitLab repository containing this project and the included `render.yaml` blueprint. No QUOS Bots source repository is currently connected in the Render workspace.

The Render dashboard’s New menu is available to create a source-backed service, but no QUOS Bots repository has been exported or selected in the workspace. The next external deployment step is to connect or create a repository, then choose the included blueprint or the standalone runtime directory.

The Render Web Service creation flow is open and waiting for its repository-selection screen. No new external service has been submitted or created.

Searching the connected Render Git-provider account for `quos-bots` returned no results. Connecting GitHub alone did not export this managed project into a repository, so the required source-export step remains outstanding.

The existing published QUOS Bots site is autoscaled. An autoscaled web process is not a reliable home for a persistent Discord Gateway connection because it can scale down when idle. The external portable runtime should be used only while the selected free-tier process remains awake; it cannot honestly be represented as a no-cost 24/7 Discord host.

After an account owner signs in, choose the prepared `render.yaml` blueprint or import the project into Replit. Add the Discord token, application ID, guild ID, dashboard credentials, and any optional LLM key in that provider's secret manager, then run the one-time channel bootstrap only if channels are not already present.
