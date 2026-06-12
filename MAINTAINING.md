# Maintaining

This document defines the public maintainer operating rules for Jeju Radar Training Simulator.

The repository is maintained as a training-only simulator project. It must not be presented as operational ATC software, a navigation source, a certified simulator, dispatch tooling, or a safety-critical decision aid.

## Maintainer Responsibilities

- Keep the public repository buildable and verifiable.
- Keep the data authority boundary explicit.
- Keep generated folders, private source material, local evidence, secrets, and oversized raw geometry out of Git.
- Keep GitHub issues and releases organized around visible milestones.
- Keep public documentation aligned with the current release state.
- Reject or block changes that weaken the training-only boundary.

## Release Discipline

Every public release must have:

- A clear version tag.
- Release notes that state what changed.
- Verification evidence from local checks and GitHub Actions.
- No unresolved public-safety or data-authority concern for the changed files.

The standard release gates are:

```powershell
cd jeju-radar-ui
npm ci
npm audit --audit-level=moderate
npm run build
npm run verify:public

cd ..
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate_coordinate_authority.ps1

cd phraseology_contract
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\validate_phraseology_contract.ps1
node scripts\verify-parser.mjs
node scripts\verify-response-policy.mjs
node scripts\verify-voice-tolerance-cases.mjs
```

## Triage Cadence

For normal maintenance:

- Review new issues before assigning a milestone.
- Add an `area:*`, `type:*`, and `priority:*` label when the issue is actionable.
- Use `status:blocked` when the next action needs missing information.
- Keep release milestones small enough to verify.

## Data Authority Changes

Any change to data under `data/` must explain:

- What changed.
- Whether the changed data is exact, derived, training, reference-only, visual-only, or blocked.
- Which public verification command covers the change.
- Why the change is safe to redistribute.

Do not copy private PDFs, SOPs, training manuals, tacit local notes, or non-redistributable source text into the repository.

## AI Pilot Boundary

AI pilot work is intentionally deferred until after the public demo release.

When AI pilot work begins:

- API keys must stay server-side.
- Generated responses must be training artifacts.
- The phraseology contract and response policy must act as guardrails.
- The project must continue to reject operational ATC or navigation claims.
