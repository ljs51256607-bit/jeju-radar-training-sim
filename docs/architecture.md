# Architecture

Jeju Radar Training Simulator is organized as a browser-first training simulator with deterministic data and verification contracts.

## Runtime Surface

The main app lives in `jeju-radar-ui/`.

- React renders the radar-style training scope.
- Vite builds the browser bundle.
- `scripts/sync-data.ps1` copies the public `data/` subset into `jeju-radar-ui/public/` before build.
- The generated `public/` and `dist/` folders are ignored and are not part of the repository release surface.

## Data Surface

The public dataset is split by role:

- `data/authority/`: authority manifests, coordinate registers, and verification ledgers.
- `data/geometry/`: display and training geometry used by the radar UI.
- `data/reference/`: aircraft, airport, airspace, procedure, vertical-profile, and training-rule reference data.
- `data/scenarios/`: synthetic scenario seed data.

Data files are training fixtures, not operational aviation data. Upstream-derived reference values remain governed by their original publisher terms; this repository does not relicense underlying AIP source material.

## Training Contracts

The repository keeps training behavior explicit:

- Aircraft motion and route progression are checked by deterministic verification scripts.
- Procedure guidance is checked against machine-readable route and constraint data.
- Phraseology behavior is defined in `phraseology_contract/`.
- Conventional/RADAR SID geometry is intentionally separated into exact, training-runtime, and reference-overlay decisions.

## AI Pilot Direction

The long-term architecture includes AI pilot role-play for training-only readbacks and pilot responses. The AI pilot must not control real traffic or claim operational authority. It should produce practice responses while deterministic simulator state and verification scripts remain the source of truth.

## Non-Goals

- No real-world ATC operation.
- No aircraft navigation.
- No certified simulator claim.
- No redistribution of private SOPs, training manuals, local notes, or source corpora.
