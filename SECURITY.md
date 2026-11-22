# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |

## Reporting a vulnerability

Please open a private security advisory on the GitHub repository
("Security" → "Report a vulnerability") rather than a public issue. Include the
affected endpoint or component, reproduction steps and the impact you observed.
Expect an initial response within a few days. Do not run the findings against
systems you do not own.

## What TestPilot AI does and does not do

TestPilot AI is a **QA tool for websites you own or are authorized to test**. It
never attempts to bypass protections, discover credentials, exploit
vulnerabilities or perform destructive changes.

It will not:

- submit purchases, messages, bookings, deletions or account changes;
- try login credentials, bypass authentication or solve CAPTCHAs;
- exploit vulnerabilities, brute-force endpoints or flood a target;
- claim a test ran or passed when it did not.

Ambiguous or destructive controls are recorded as **skipped** with the reason.

## SSRF protection

All outbound requests (initial navigation, page resources, link checks, the
robots.txt probe and redirect hops) pass through `app/core/security.py`:

- only `http` and `https` schemes are accepted;
- credentials in URLs are rejected;
- loopback, private, CGNAT, link-local, reserved, multicast and documentation
  address ranges are blocked;
- cloud metadata endpoints (`169.254.169.254`, `100.100.100.200`,
  `fd00:ec2::254`, `metadata.google.internal`, …) are blocked;
- hostnames are resolved and **every** resolved address is checked;
- redirects are followed manually and re-validated on each hop;
- DNS rebinding is mitigated (not eliminated) by re-resolving before each hop
  and refusing blocked resolutions.

`TESTPILOT_ALLOW_LOCAL_TARGETS=true` disables these checks and exists **only**
for the bundled fixture site and integration tests. Never enable it on a shared
or public deployment; the Settings → System status panel warns when it is on.

## Data handling

- Console and network capture stores method, URL, status, resource type and
  failure text. Request bodies, cookies and `Authorization` headers are never
  persisted.
- Screenshots are served only through `/api/tests/{id}/screenshots/{sid}/file`
  with path traversal protection.
- AI analysis sends only the structured test facts (URLs, statuses, messages)
  to the provider you configure. It never sends credentials.
- API keys are read from the server environment and are never returned by the
  API, embedded in the frontend bundle or written to the database.

## Deployment hardening

- Keep `TESTPILOT_ALLOW_LOCAL_TARGETS=false`.
- Set `TESTPILOT_ALLOWED_ORIGINS` to your real frontend origin.
- Put the app behind HTTPS and authentication (reverse proxy, SSO or VPN) if it
  is exposed publicly — TestPilot has no built-in accounts by design.
- Run the containers as provided (both use non-root users).
- Store the SQLite volume and screenshots on a backup schedule.
- Rotate the AI key if it is ever exposed; only set it through environment
  variables or your orchestrator's secret store.

## Known limitations

- Health scoring and severity weighting are heuristics, not a security audit.
- Automated interaction coverage is intentionally conservative; form behaviour
  is validated in-page without submitting data.
- DNS rebinding defences are best-effort: a hostile DNS server can still answer
  differently between the validation lookup and the connection.
