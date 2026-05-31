# Current Execution Plan

## Current Objective

Prepare this repository as a public-safe OSS staging repo for the Jeju Radar Training Simulator.

## Active Gates

- G0: migration rules and blocklist fixed.
- G1: public repo skeleton and policy documents created.
- G2: selected copy and public-safety audit in progress.
- G3: public build and typecheck pending.
- G4: public verification pending.
- G5: release readiness, license, and final secret/size audit pending.

## Near-Term Work

1. Keep only public-safe app source, data, phraseology contracts, and verification scripts.
2. Remove generated artifacts, private-source dependencies, local-only corpora, VICE/toolchain helpers, and oversized raw geometry.
3. Sanitize derived data metadata so it does not expose local source paths or private source labels.
4. Run `npm install`, `npm run build`, and `npm run verify:public` from `jeju-radar-ui`.
5. Run coordinate authority and phraseology verification from the repository root.
6. Complete license and data-license decisions before public release.

## Non-Goals

- No operational ATC claim.
- No navigation or certification claim.
- No redistribution of private source material.
- No multi-airport framework expansion until the RKPC public reference implementation is stable.
