# Browser workspace validation

## Local static preview — 2026-08-24

The GitHub Pages artifact was served locally over HTTP and rendered successfully as a browser-only QUOS workspace. The preview displayed all **101** QB-001–QB-101 persona cards, with one **Assign task** control and one reversible **Kill bot** control per persona.

The visible header also included **Export brain.jsonl**, **Record earning**, and Firebase operator sign-in controls. The hero copy explicitly stated that tasks run only in an authenticated operator’s open browser tab and that no Discord Gateway or background worker is used. The initial empty state correctly showed zero activity, zero verified earnings, and idle persona status without fabricating task or revenue data.

This check verifies client rendering and browser-side controls only. Live Gemini requests and Firebase writes remain dependent on an enabled Firebase operator and publication of the revised Firestore rules.

## Hosted GitHub Pages verification — 2026-08-24

The GitHub Actions deployment for commit `55bce45` completed successfully. The published workspace at `https://quosdevelopment.github.io/quos-bots/?v=55bce45` displayed the browser-only title and boundary notice, all 101 persona cards, 101 **Assign task** controls, 101 **Kill bot** controls, **Export brain.jsonl**, and **Record earning**.

Firebase web configuration loaded successfully. The visible zero-task and zero-earning state is expected until an enabled operator publishes the revised Firestore rules and records a browser task or verified earning. No Gemini credential, task result, or fabricated earning was inserted during this verification.

## Firebase Console readiness — 2026-08-24

The Firebase Console session is authenticated to the `quos-bots` project as the project owner, and the default Firestore database’s **Rules** editor is open. The revised policy is prepared in `firebase/github-pages.firestore.rules`; publication remains pending explicit confirmation because it changes access control by adding public sanitized task/status/earnings reads and operator-only detailed brain records for the browser workspace.

## Firestore policy publication — 2026-08-25

After explicit approval, the full browser-workspace policy was applied and published. The Rules editor now lists a new **Today • 1:19 AM** active revision without an unpublished-changes control. The repaired policy source contains public reads for sanitized `browserTasks`, `browserBotStatuses`, and `browserEarnings`; it restricts detailed `browserBrain` records to an enabled operator. The repaired policy still needs publication after the code deployment.

## Operator-authentication status — 2026-08-25

The dashboard was returned from two Google redirect attempts, but the hosted page still displayed **Operator sign in** and did not retain a Firebase Auth user in the browser session. Firestore policy publication is complete; creating `dashboardOperators/<UID> { enabled: true }` and an end-to-end browser task require a successful dashboard Google sign-in that yields a Firebase UID. No operator record or task record was fabricated.

The deployed `firebase-config.js` was independently verified to contain the expected public `quos-bots` Web configuration, and the deployed dashboard script contains the Firebase Auth initialization path. The remaining issue is completion/persistence of the browser Google OAuth session, not an absent public Firebase configuration asset.

The Firebase Console confirms that the **Google** sign-in provider is enabled, but the Firebase Authentication user list still contains no users. A later redirect correctly reached Google’s account picker for `quos-bots.firebaseapp.com`, yet returning to the dashboard still left the button as **Operator sign in**. The browser OAuth completion must produce a Firebase user before the operator UID can be created and before live task or earning records can be validated.

## Email/Password recovery identity — 2026-08-25

The project owner created a Firebase Authentication Email/Password user for the dashboard email address. The Firebase Console now lists one user. Its UID is treated as privileged configuration and is used only to create the corresponding `dashboardOperators` authorization document; it is not recorded in this public repository document.

With the owner’s explicit approval, a `dashboardOperators` document was submitted in Firestore using that privileged UID and a Boolean `enabled: true` field. The console returned to the data root after the save action; a separate refresh/record check is required before treating the authorization as verified.

During the subsequent document check, the authenticated Firebase Console data view returned a blank application canvas despite retaining the signed-in account chrome. The saved operator record will therefore be confirmed through the dashboard authorization path after the Email/Password session succeeds; it is not yet claimed as independently verified.

On the hosted dashboard, the Firebase Auth and Firestore client objects both initialized successfully. The data indicator remained in a transient `FIREBASE CONNECTING` state during the next check. Investigation identified that the first browser-workspace implementation used an invalid two-segment browser-workspace hierarchy. The code and rules now use valid root collections: `browserTasks`, `browserBotStatuses`, `browserEarnings`, and operator-only `browserBrain`. No browser-workspace task or earnings records existed, so no record migration is required; the corrected deployment and rules still require live validation.
