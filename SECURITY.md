# Security Policy

## Reporting a vulnerability

Report vulnerabilities privately through GitHub private vulnerability reporting: open the repository **Security** tab and choose **Report a vulnerability**.

Do not open a public issue for a suspected vulnerability.

## Supported versions

Only the latest release is supported. Fixes land in a new release; update with `claude plugin update orchestrator@kele-dev`.

## Known limits

- The guards are advisory. The edit guard cannot see shell writes such as `sed -i` or `>`; see the guard limits in the README.
- Hooks fail open: without Node 18+ on PATH they do nothing.
- `verify.sh`, `verify.ps1` and the hook scripts run with your user's permissions.
