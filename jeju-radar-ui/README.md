# Jeju Radar UI

React/Vite browser app for the Jeju Radar Training Simulator.

This app renders the training radar surface, loads the public reference dataset from `public/`, and runs deterministic checks for procedure guidance, motion, arrival streams, scenario presets, selected SID geometry contracts, and bundle secret hygiene.

## Setup

```powershell
npm install
npm run build
```

`npm run build` runs `scripts/sync-data.ps1` first. The script copies the repository's public `data/` subset into `jeju-radar-ui/public/`. That generated `public/` directory is intentionally ignored by Git.

## Public Verification

```powershell
npm run verify:public
```

Individual checks:

```powershell
npm run verify:typecheck
npm run verify:procedures
npm run verify:motion
npm run verify:arrival-streams
npm run verify:scenario-presets
npm run verify:coverage
npm run verify:sid-geometry-audit
npm run verify:sid-derived-geometry
npm run verify:conventional-sid-authority-policy
npm run verify:secret-scan
```

Voice/PTT proxy experiments and private-source corpus checks are not part of the public verification set.
