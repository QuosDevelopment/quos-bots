# Hosted deployment log

| Step | Current result |
| --- | --- |
| Firebase account | The owner authenticated to the existing **Quos Bots** Firebase Spark project and confirmed that Firestore is ready. |
| Firestore database | Verified in the Firebase Console as the default database in `asia-south1`; the public Web app configuration was added to the dashboard source. |
| Firestore policy | The sanitized-dashboard policy was loaded into the Firestore Rules editor for publication; the console remained in a transient unpublished-change state after submission and requires confirmation on the next console refresh. |
| GitHub repository visibility | The owner explicitly approved publication; `QuosDevelopment/quos-bots` was changed from private to public for free GitHub Pages eligibility. |
| GitHub Pages deployment | Published successfully through GitHub Actions: `https://quosdevelopment.github.io/quos-bots/`. The hosted HTTPS page renders all 101 cards and both control actions. |
| Firebase live-data verification | Pending Firebase Web configuration, deployed rules, and a running Firebase-backed Replit runtime. The Firebase Console’s direct product/settings pages remained blank in this browser session after the owner’s Firestore confirmation. |

The static GitHub Pages dashboard’s persistent public availability must not be confused with the free-tier Discord runtime’s availability: the bot process can still sleep or restart.
