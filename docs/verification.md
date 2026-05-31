# Verification

This repository is maintained around repeatable public verification. The default checks must run without private PDFs, local-only evidence, local secrets, or generated artifacts committed to Git.

## UI Verification

From `jeju-radar-ui/`:

```powershell
npm ci
npm audit --audit-level=moderate
npm run build
npm run verify:public
```

`npm run verify:public` runs:

- TypeScript typecheck
- Procedure guidance verification
- Motion-model verification
- Arrival stream airway verification
- Scenario preset verification
- SID/STAR coverage verification
- Conventional/RADAR SID geometry audit checks
- Conventional/RADAR SID derived-geometry checks
- Conventional/RADAR SID authority-policy checks
- Bundle/source hygiene scan

## Coordinate Authority

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate_coordinate_authority.ps1
```

This verifies that public data authority labels are internally consistent and that exact, derived, training, and reference-only data are not mixed silently.

## Phraseology Contract

From `phraseology_contract/`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate_phraseology_contract.ps1
node scripts\verify-parser.mjs
node scripts\verify-response-policy.mjs
node scripts\verify-voice-tolerance-cases.mjs
```

These checks validate command grammar, parser test cases, pilot response policy, and voice phraseology tolerance cases.

## Ignored Artifacts

Generated folders such as `jeju-radar-ui/public/`, `jeju-radar-ui/dist/`, `jeju-radar-ui/node_modules/`, and hidden verification output folders are intentionally ignored.

Before packaging a ZIP or local handoff, preview ignored artifacts:

```powershell
git clean -ndX
```

Use GitHub as the public release source. Do not publish a local ZIP unless ignored artifacts have been reviewed or removed.
