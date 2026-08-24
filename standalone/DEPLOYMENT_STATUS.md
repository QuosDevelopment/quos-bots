# External Deployment Status

The portable QUOS Bots runtime, `render.yaml`, and `.replit` configuration are prepared in this repository. The Render dashboard page did not expose an authenticated deployment interface in the current browser session, so no external service can be created from this workspace without the account owner completing sign-in.

The Render workspace is now authenticated and shows an existing `quos-university` service. A new QUOS Bots Render service will require an external source connection, normally a GitHub or GitLab repository containing this project and the included `render.yaml` blueprint. No QUOS Bots source repository is currently connected in the Render workspace.

The Render dashboard’s New menu is available to create a source-backed service, but no QUOS Bots repository has been exported or selected in the workspace. The next external deployment step is to connect or create a repository, then choose the included blueprint or the standalone runtime directory.

The Render Web Service creation flow is open and waiting for its repository-selection screen. No new external service has been submitted or created.

Searching the connected Render Git-provider account for `quos-bots` returned no results. Connecting GitHub alone did not export this managed project into a repository, so the required source-export step remains outstanding.

The QUOS Bots source repository has now been created privately under `QuosDevelopment/quos-bots` and pushed successfully. Render’s connected GitHub credential still reports access to only one repository, so it must be reauthorized or expanded in GitHub to include the new private repository before Render can select it.

Render’s credential configuration opened the GitHub sign-in page. The repository-access change requires the GitHub account owner to authenticate and approve Render’s access to the private `QuosDevelopment/quos-bots` repository.

The account owner approved narrow Render access for the `quos-bots` repository and the deployment flow returned to Render’s Web Service source selector.

After the authorization return, Render’s `/web/new` page did not render usable source-selection controls in the current browser session despite repeated load checks. The repository is available at `https://github.com/QuosDevelopment/quos-bots`; the Render source flow should be retried from the dashboard or via the Public Git Repository option if the private Git-provider view remains blank.

The revised free-tier architecture moves the Discord Gateway from Render to Replit. The Replit login page is open, but no authenticated Replit session is present in the current browser. Real `/status` and `/research` verification therefore remains blocked until the account owner signs in, imports the private GitHub repository, and supplies the Firebase, Gemini, Discord, and dashboard secrets in Replit's protected settings.

Render’s blueprint source selector successfully listed the private `QuosDevelopment/quos-bots` repository after the narrow GitHub approval, and that repository has been selected. The blueprint configuration page is loading; no service has been submitted yet.

The existing published QUOS Bots site is autoscaled. An autoscaled web process is not a reliable home for a persistent Discord Gateway connection because it can scale down when idle. The external portable runtime should be used only while the selected free-tier process remains awake; it cannot honestly be represented as a no-cost 24/7 Discord host.

After an account owner signs in, choose the prepared `render.yaml` blueprint or import the project into Replit. Add the Discord token, application ID, guild ID, dashboard credentials, and any optional LLM key in that provider's secret manager, then run the one-time channel bootstrap only if channels are not already present.
