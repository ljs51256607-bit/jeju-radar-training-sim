# Release Process

This document defines the public release process for Jeju Radar Training Simulator.

## Release Types

- Patch release: maintainer operations, documentation, CI, templates, small fixes.
- Minor release: public demo, new training surface, verified simulator capability.
- Prototype release: early AI pilot or larger runtime boundary work.

## Pre-Release Checklist

Before creating a tag:

- Confirm the release scope is documented in `CHANGELOG.md`.
- Confirm the changed files do not add private source material, secrets, generated folders, or oversized raw geometry.
- Confirm public documentation still states the training-only boundary.
- Confirm data authority labels are preserved for data changes.
- Confirm the working tree is clean except ignored local build artifacts.

## Required Verification

Run:

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
```

Then:

```powershell
cd phraseology_contract
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate_phraseology_contract.ps1
node scripts\verify-parser.mjs
node scripts\verify-response-policy.mjs
node scripts\verify-voice-tolerance-cases.mjs
```

## Public Boundary Audit

Run:

```powershell
git diff --check
git clean -ndX
git ls-files | rg -n "(^|/)(node_modules|dist|build|output|tmp|public|docs/internal)(/|$)|\.(pdf|docx|pptx|xlsx|zip|7z|rar|mp3|wav|m4a|mp4|mov)$|\.env($|\.)|api[_-]?key|secret|credential|private" -i
```

The tracked-file audit should not list generated folders, private document formats, environment files, secrets, credentials, or private-source artifacts.

## Tag and Release

After verification passes:

```powershell
git tag -a vX.Y.Z -m "vX.Y.Z Release Title"
git push origin vX.Y.Z
gh release create vX.Y.Z --title "vX.Y.Z Release Title" --notes "..."
```

Release notes must mention:

- What changed.
- What was verified.
- Any explicit training-only or non-operational boundary relevant to the release.

## Post-Release

- Confirm GitHub Actions passed on `main`.
- Confirm the GitHub release points to the intended commit.
- Confirm README links and badges still resolve.
- Move remaining work into the next milestone.
