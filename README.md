# Jeju Radar Training Simulator

Jeju Radar Training Simulator is an open-source staging project for a browser-based radar training simulator focused on procedure-based ATC training, deterministic scenario replay, coordinate authority validation, and phraseology regression testing.

Jeju/RKPC is the first reference implementation.

This is not an operational ATC system. It is not for real-world air traffic control, navigation, dispatch, certification, or safety-critical decision making.

## Project Status

This repository is currently an OSS staging workspace.

The source project is being migrated by allowlist, not copied wholesale. The first migration goal is a public candidate repo that can build and run core verification without private source files, local secrets, generated artifacts, or oversized data.

## What This Project Is For

- Radar-style browser UI for procedure-based training scenarios
- RKPC/Jeju reference data displayed through an explicit coordinate authority policy
- Aircraft state, command handling, route progression, and radar-level motion checks
- DCT, STAR, SID, ILS, missed approach, handoff, visual approach, and traffic-flow rehearsal surfaces
- Deterministic verification for procedures, motion, scenarios, data authority, and phraseology contracts

## What This Project Is Not

- Not an operational ATC system
- Not a navigation source
- Not a certified simulator
- Not a replacement for official AIP, SOP, training manuals, or regulator-approved tools
- Not a repo for redistributing private training material, local SOP PDFs, or secrets

## Intended Public Repo Shape

```text
jeju-radar-training-sim-oss/
  README.md
  DISCLAIMER.md
  DATA_POLICY.md
  CONTRIBUTING.md
  SECURITY.md
  ROADMAP.md
  LICENSE
  DATA_LICENSE.md
  data/
    authority/
    geometry/
    reference/
    scenarios/
  docs/
  jeju-radar-ui/
    index.html
    package.json
    src/
    scripts/
    tsconfig.json
    vite.config.ts
  phraseology_contract/
  scripts/
```

## Expected Local Verification

```powershell
cd jeju-radar-ui
npm install
npm audit --audit-level=moderate
npm run build
npm run verify:public
```

Coordinate authority verification:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate_coordinate_authority.ps1
```

Phraseology contract verification:

```powershell
cd phraseology_contract
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate_phraseology_contract.ps1
node scripts\verify-parser.mjs
node scripts\verify-response-policy.mjs
node scripts\verify-voice-tolerance-cases.mjs
```

## Migration Control

Internal migration notes are kept outside the public release surface. The public boundary is defined by this README, [DATA_POLICY.md](DATA_POLICY.md), [DISCLAIMER.md](DISCLAIMER.md), and the verification scripts included in this repository.

## Data Policy

See [DATA_POLICY.md](DATA_POLICY.md).

Repository-authored derived data is covered separately in [DATA_LICENSE.md](DATA_LICENSE.md). The code is covered by [LICENSE](LICENSE).

The short version:

- Public repo data must be derived, documented, and safe to redistribute.
- Private PDFs, SOPs, training manuals, tacit notes, and local secrets are not included.
- Exact, training, and reference-only geometry must be labeled separately.

## Disclaimer

See [DISCLAIMER.md](DISCLAIMER.md).
