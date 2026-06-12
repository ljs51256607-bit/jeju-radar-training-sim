# Security Policy

## Supported Status

This repository is a public, training-only OSS project. Security handling is focused on secret hygiene, safe data boundaries, and preventing accidental publication of local/private material.

## Do Not Commit

- API keys
- `.env` files
- Credentials
- Bearer tokens
- Private SOPs
- Non-redistributable training manuals
- Local-only evidence folders
- Generated logs containing sensitive data
- Exported voice/PTT traces containing user-spoken transcripts

## Secret Handling

If a secret is accidentally committed:

1. Remove it from the working tree.
2. Rotate or revoke the secret immediately.
3. Treat Git history as compromised until it is cleaned.
4. Do not paste the secret into an issue, PR, chat, or report.

## Reporting

Do not disclose sensitive security or private-source material in a public issue.

Use GitHub private vulnerability reporting when it is available for this repository. If that reporting path is unavailable, open a minimal public issue that says a private security or data-boundary review is needed, but do not include sensitive details.

This applies when the issue involves:

- Secret exposure
- Private source material
- Non-public aviation documents
- Sensitive local file paths
- Data that should not be redistributed

Public issues are acceptable for ordinary bugs that do not disclose sensitive information.

## Verification

Before every release, run a secret scan and file-size audit. At minimum:

```powershell
rg --files | rg -i "API KEY|SECRET|TOKEN|PASSWORD|node_modules|dist|output|tmp|tools|coastline_lines\.geojson"
rg -n -i "sk-(proj-)?[A-Za-z0-9_-]{20,}|OPENAI[_-]?API[_-]?KEY|Bearer\s+[A-Za-z0-9._-]{20,}|password\s*[:=]|token\s*[:=]"
Get-ChildItem -Recurse -File | Sort-Object Length -Descending | Select-Object -First 30 FullName,Length
```
