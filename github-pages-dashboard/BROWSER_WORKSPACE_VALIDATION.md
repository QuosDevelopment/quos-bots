# Browser workspace validation

## Local static preview — 2026-08-24

The GitHub Pages artifact was served locally over HTTP and rendered successfully as a browser-only QUOS workspace. The preview displayed all **101** QB-001–QB-101 persona cards, with one **Assign task** control and one reversible **Kill bot** control per persona.

The visible header also included **Export brain.jsonl**, **Record earning**, and Firebase operator sign-in controls. The hero copy explicitly stated that tasks run only in an authenticated operator’s open browser tab and that no Discord Gateway or background worker is used. The initial empty state correctly showed zero activity, zero verified earnings, and idle persona status without fabricating task or revenue data.

This check verifies client rendering and browser-side controls only. Live Gemini requests and Firebase writes remain dependent on an enabled Firebase operator and publication of the revised Firestore rules.
