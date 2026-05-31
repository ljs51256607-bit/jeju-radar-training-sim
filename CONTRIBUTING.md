# Contributing

This repository is being prepared as an open-source radar training simulator. Contributions are welcome only when they preserve the project's safety, data, and verification boundaries.

## Ground Rules

- Do not add real secrets, API keys, credentials, or `.env` files.
- Do not add private PDFs, SOPs, training manuals, tacit notes, or local-only source material.
- Do not add generated dependency folders or build output.
- Do not call this project operational, certified, or suitable for real-world ATC or navigation.
- Do not label approximate, candidate, or reference-only geometry as exact.

## Preferred Contribution Areas

- Deterministic verification scripts
- Procedure/runtime bug fixes
- Radar UI readability and training workflow improvements
- Scenario replay and import/export improvements
- Data policy, documentation, and source traceability improvements
- Secret hygiene and repo cleanup tooling

## Before Opening a Pull Request

Run the relevant checks for the files you changed.

For UI/runtime changes:

```powershell
cd jeju-radar-ui
npx tsc --noEmit
npm run build
```

For procedure, motion, or scenario changes:

```powershell
cd jeju-radar-ui
npm run verify:procedures
npm run verify:motion
npm run verify:arrival-streams
npm run verify:scenario-presets
```

For data authority changes:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate_coordinate_authority.ps1
```

For phraseology changes:

```powershell
cd phraseology_contract
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate_phraseology_contract.ps1
node scripts\verify-parser.mjs
node scripts\verify-response-policy.mjs
node scripts\verify-voice-tolerance-cases.mjs
```

## Data Contributions

Data contributions must follow [DATA_POLICY.md](DATA_POLICY.md).

Every data change should explain:

- What changed
- Whether it is exact, derived, training, or reference-only
- What source or calculation supports it
- Which verification command covers it

If the data depends on a private or non-redistributable source, do not include the source file or copied text in the repository.

## Pull Request Summary Template

```text
Summary:
- 

Verification:
- [ ] npx tsc --noEmit
- [ ] npm run build
- [ ] relevant verify command:

Data/security review:
- [ ] no secrets
- [ ] no private source files
- [ ] no generated artifacts
- [ ] no oversized raw data
```

