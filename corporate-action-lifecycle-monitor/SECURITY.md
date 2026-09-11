# Security

Please report vulnerabilities through GitHub private vulnerability reporting for `manasijatech/drishti-templates`. Do not open a public issue for an undisclosed vulnerability.

Include the affected route or file, reproduction steps, expected impact, and any relevant configuration. Remove API keys and personal data from logs or screenshots.

## Sensitive configuration

Keep these values server-side and out of version control:

- `DRISHTI_API_KEY`
- `OPENROUTER_API_KEY`
- Credential-bearing `MONGODB_URI` values

Only `NEXT_PUBLIC_LIFECYCLE_WS_URL` is intended for the browser bundle.

Before exposing the app publicly, set an explicit `FRONTEND_ORIGIN`, use TLS for browser and API traffic, restrict MongoDB network access, and store secrets in the deployment platform's secret manager.
