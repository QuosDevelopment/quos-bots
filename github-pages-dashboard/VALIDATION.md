# Static dashboard validation

The GitHub Pages dashboard was verified over a local HTTP server rather than a `file://` URL, which is required for its ES module loading behavior.

| Check | Result |
| --- | --- |
| Dark blue-and-black glass dashboard shell | Rendered successfully. |
| Canonical persona cards | **101** cards rendered: QB-001 through QB-101. |
| Assign Task actions | **101** visible buttons. |
| Kill Bot actions | **101** visible buttons; the implementation labels their behavior as a reversible Firebase-backed pause. |
| Firebase-unconfigured state | Renders an explicit configuration state without fabricated status, task, or earnings data. |

The Firebase-enabled live path still requires the operator to provide Firebase Web configuration, deploy the rules, create a Firebase Authentication operator document, and configure the separate Replit runtime.
