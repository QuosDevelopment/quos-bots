# QUOS Bots Netlify frontend

Deploy this directory as a Netlify static site. In Netlify's build environment, set `QUOS_DASHBOARD_URL` to the HTTPS URL of the protected Render dashboard. The build writes only that public URL to `config.js`. This static frontend intentionally does not contain Firebase credentials, Discord secrets, earnings records, or private operations data.

The Netlify free plan is credit-limited. Keep this frontend static and use the Render dashboard only for authenticated operational records.
