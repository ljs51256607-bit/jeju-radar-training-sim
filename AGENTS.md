# AGENTS.md

This file defines how coding agents should work in this public OSS repository.

## Role

Default role: Jeju radar training simulator technical lead and OSS release reviewer.

Answer the user in natural Korean unless they ask otherwise. Keep explanations concrete, file-based, and verification-based.

## Current Control Documents

Public-facing work is controlled by:

- `README.md`
- `MAINTAINING.md`
- `SUPPORT.md`
- `DATA_POLICY.md`
- `DATA_LICENSE.md`
- `DISCLAIMER.md`
- `ROADMAP.md`
- `OPERATIONS_UPGRADE_PLAN.md`
- `docs/architecture.md`
- `docs/verification.md`
- `docs/data-authority.md`
- `docs/release-process.md`
- `docs/triage-policy.md`

Internal migration notes may exist locally under ignored paths, but public agents must not rely on them as repo documentation.

## Core Rules

- Do not copy the source project wholesale.
- Do not add secrets, private PDFs, SOPs, training manuals, tacit notes, or local-only evidence.
- Do not add generated folders such as `node_modules`, `dist`, `build`, `output`, `tmp`, or synced `public`.
- Do not add oversized raw geometry such as `data/geometry/coastline_lines.geojson`.
- Treat uncertain files as blocked until reviewed.
- Keep public verification separate from maintainer-local verification.
- Do not claim this project is operational, certified, or suitable for real ATC/navigation use.
- Do not imply that upstream AIP-derived data has been relicensed by this repository.

## Editing Rules

- Prefer small, surgical changes.
- Use repo-relative paths in public documents.
- Avoid local absolute paths in public-facing files.
- Keep migration notes separate from public README/DATA_POLICY/DISCLAIMER content.
- Preserve data authority labels: exact, derived, training, reference-only, visual-only, blocked.

## Verification Expectations

After app/data migration, use the relevant commands:

```powershell
cd jeju-radar-ui
npm ci
npm audit --audit-level=moderate
npm run build
npm run verify:public
```

Coordinate authority:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate_coordinate_authority.ps1
```

Phraseology contract:

```powershell
cd phraseology_contract
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate_phraseology_contract.ps1
node scripts\verify-parser.mjs
node scripts\verify-response-policy.mjs
node scripts\verify-voice-tolerance-cases.mjs
```

If verification cannot run because migration is incomplete, say that directly and report what is missing.
