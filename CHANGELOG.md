# Changelog

## v0.1.1 Maintainer Operations

Maintainer operations release for the public OSS repository.

### Included

- Release-based roadmap update.
- Maintainer policy and support policy.
- Release process and triage policy documentation.
- GitHub issue templates and pull request template.
- Dependabot configuration for UI npm dependencies.
- Manual and weekly scheduled verification workflow triggers.
- Public documentation links for maintainer operations.

### Explicitly Preserved

- Training-only boundary.
- Non-operational, non-navigation, non-certified simulator disclaimer.
- Public-safe data boundary.
- Exclusion of private SOPs, PDFs, training manuals, tacit notes, local evidence, secrets, generated folders, and oversized raw geometry.

## v0.1.0 Public Release Candidate

Initial public release candidate for Jeju Radar Training Simulator.

### Included

- Browser-based radar training UI under `jeju-radar-ui/`.
- Public-safe reference, authority, geometry, and scenario data under `data/`.
- Coordinate authority validation.
- Procedure guidance, motion-model, arrival-stream, scenario, and SID/STAR verification.
- Phraseology contract, parser checks, pilot response policy checks, and voice tolerance cases.
- Data policy, data licensing boundary, disclaimer, security policy, and public documentation.
- GitHub Actions workflow for repeatable public verification.
- README screenshot showing the public radar training scope.

### Explicitly Excluded

- Operational ATC use.
- Navigation use.
- Certified simulator claims.
- Private SOPs, training manuals, tacit notes, local evidence, source corpora, secrets, generated folders, and oversized raw geometry.

### Release Gate

Before tagging `v0.1.0`, run:

```powershell
cd jeju-radar-ui
npm ci
npm audit --audit-level=moderate
npm run build
npm run verify:public
```

Then from the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate_coordinate_authority.ps1

cd phraseology_contract
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate_phraseology_contract.ps1
node scripts\verify-parser.mjs
node scripts\verify-response-policy.mjs
node scripts\verify-voice-tolerance-cases.mjs
```
