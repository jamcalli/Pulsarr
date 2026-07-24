# Security Policy

## Reporting a Vulnerability

Please report suspected vulnerabilities privately through GitHub's [Report a vulnerability](https://github.com/jamcalli/Pulsarr/security/advisories/new) button. Do not open public issues or discussions for security reports.

Include the version or commit SHA, a working proof-of-concept against a stock deployment, and the affected code path or HTTP request/response. We aim to acknowledge reports within a week and are a small project, so timelines are best-effort.

Please give us reasonable time to ship a fix before disclosing publicly. We'll credit you in the advisory unless you'd prefer to stay anonymous.

## Supported Versions

Only the latest release is supported. Fixes always go forward in a new release. We do not backport patches to older versions.

## Threat Model

Pulsarr is self-hosted, single-admin software. The only account that can authenticate to the API is the instance owner, who is fully trusted. Everyone else is denied at the auth layer. Scope decisions follow from this: the owner already controls the server, its config, and every outbound request the app makes by design.

## In Scope

- Authentication bypass granting access without valid owner credentials.
- SQL or command injection, RCE, or stored XSS reachable through untrusted data, including a malicious response from an upstream the owner connected to (Radarr, Sonarr, Plex).
- Leakage of secrets or credentials to an unauthorized party.

## Out of Scope

- Owner-authenticated routes (the owner is trusted by design). This includes the server making outbound requests to owner-supplied URLs, such as the Radarr/Sonarr test-connection and webhook endpoints. Reaching an internal or external host with a URL the owner configured is intended behavior, not SSRF.
- Non-owner scenarios. Pulsarr has no multi-user API; there is no lower-privileged account to escalate from.
- Consequences of `authenticationMethod: disabled` or `requiredExceptLocal`. These are opt-in choices for trusted networks. Anyone who can reach the port in those modes already has that network access.
- Findings that require pre-existing filesystem or database access.
- Vulnerabilities in third-party dependencies (report those upstream; you may also notify us so we can track and patch).
- Theoretical findings without a proof-of-concept.

## AI-Assisted Reports

Reports drafted with AI assistance are welcome, but you must review them before submitting and disclose the assistance used. Unedited LLM audit output will be closed without a detailed response. Verify the finding reproduces and that its assumptions are not hallucinated.
