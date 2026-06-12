# Operations Upgrade Plan

This document is the execution plan for making Jeju Radar Training Simulator look and operate like an actively maintained public OSS project.

The work is split into two releases:

- `v0.1.1 Maintainer Operations`: prove that the repository has maintainer discipline.
- `v0.2.0 Public Demo`: prove that reviewers and contributors can try the simulator directly.

## Operating Principles

- Keep the project training-only.
- Do not claim operational ATC, navigation, dispatch, certification, or safety-critical suitability.
- Do not add private SOPs, PDFs, training manuals, tacit notes, local-only evidence, secrets, generated folders, or oversized raw geometry.
- Keep public verification separate from maintainer-local verification.
- Prefer small, reviewable changes.
- Every release must have a clear verification trail.

## Current Baseline

The repository already has:

- Public GitHub repository.
- `v0.1.0 Public Release Candidate`.
- Passing `Verify` GitHub Actions workflow.
- README screenshot.
- Initial roadmap issues.
- Data policy, data license boundary, disclaimer, security policy, and public verification docs.

Initial v0.1.1 gaps:

The following items describe the gaps this plan was created to close. After `v0.1.1`, verify completion against the Phase 1 completion criteria rather than treating this list as current state.

- `ROADMAP.md` still reads like staging work.
- No issue templates.
- No pull request template.
- No maintainer operations document.
- No support policy.
- No release-process document.
- No triage policy.
- No scheduled CI or Dependabot configuration.
- No public demo URL.

## Phase 1: v0.1.1 Maintainer Operations

### Goal

Make the repository look actively maintained, not merely published once.

### Deliverables

1. Update `ROADMAP.md`
   - Mark `v0.1.0` public release candidate work as completed.
   - Replace staging language with release-based roadmap language.
   - Add clear `v0.1.1`, `v0.2.0`, and `v0.3.0` targets.

2. Add maintainer documentation
   - `MAINTAINING.md`
   - `SUPPORT.md`
   - `docs/release-process.md`
   - `docs/triage-policy.md`

3. Add GitHub contribution operations files
   - `.github/ISSUE_TEMPLATE/bug_report.yml`
   - `.github/ISSUE_TEMPLATE/feature_request.yml`
   - `.github/ISSUE_TEMPLATE/data_authority_question.yml`
   - `.github/ISSUE_TEMPLATE/training_scenario_request.yml`
   - `.github/ISSUE_TEMPLATE/config.yml`
   - `.github/pull_request_template.md`

4. Add maintenance automation
   - `.github/dependabot.yml`
   - Update `.github/workflows/verify.yml` with:
     - `workflow_dispatch`
     - weekly scheduled verification

5. Organize GitHub operations surface
   - Add labels:
     - `area:ai-pilot`
     - `area:demo`
     - `area:phraseology`
     - `area:data-authority`
     - `area:scenario`
     - `area:docs`
     - `area:ci`
     - `type:feature`
     - `type:maintenance`
     - `type:question`
     - `priority:p1`
     - `priority:p2`
     - `priority:p3`
     - `status:blocked`
     - `status:ready`
   - Add milestones:
     - `v0.1.1 Maintainer Operations`
     - `v0.2.0 Public Demo`
     - `v0.3.0 AI Pilot Runtime Prototype`
   - Assign existing issues:
     - `#1 Add AI pilot agent runtime` -> `v0.3.0`, `area:ai-pilot`, `type:feature`, `priority:p1`
     - `#2 Add web demo deployment` -> `v0.2.0`, `area:demo`, `type:feature`, `priority:p1`
     - `#3 Add scenario debrief and evaluation report` -> `v0.3.0`, `area:scenario`, `type:feature`, `priority:p2`
     - `#4 Add enroute and ACC training mode` -> later or `v0.3.0`, `area:scenario`, `type:feature`, `priority:p3`
     - `#5 Add controller phraseology scoring` -> `v0.3.0`, `area:phraseology`, `type:feature`, `priority:p2`

### Phase 1 Verification

Run from the repository root unless stated otherwise:

```powershell
git status --short --branch

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

Also verify:

```powershell
git diff --check
git clean -ndX
git ls-files | rg -n "(^|/)(node_modules|dist|build|output|tmp|public|docs/internal)(/|$)|\.(pdf|docx|pptx|xlsx|zip|7z|rar|mp3|wav|m4a|mp4|mov)$|\.env($|\.)|api[_-]?key|secret|credential|private" -i
```

### Phase 1 Completion Criteria

- Working tree is clean except ignored local build artifacts.
- `ROADMAP.md` no longer reads like an unfinished staging plan.
- Maintainer, support, release, and triage docs exist.
- Issue templates and PR template exist.
- Dependabot exists.
- CI supports manual and scheduled runs.
- GitHub labels and milestones are organized.
- Existing issues are mapped to milestones and labels.
- GitHub Actions `Verify` passes on `main`.
- `v0.1.1 Maintainer Operations` release is created.

## Phase 2: v0.2.0 Public Demo

### Goal

Make the simulator directly inspectable from the README through a hosted public demo.

### Recommended Approach

Use a static deployment target suitable for Vite:

- GitHub Pages: simplest repository-native option.
- Netlify or Vercel: stronger product/demo signal.

If no platform preference is given, choose GitHub Pages first for the smallest operational surface. Use Netlify or Vercel if the user wants a more polished deployment signal.

The current free-first decision is GitHub Pages.

GitHub Pages implementation must handle:

- Vite `base` path for `/jeju-radar-training-sim/`.
- Public data fetches under `import.meta.env.BASE_URL`.
- A repeatable Pages deployment workflow.
- A visible training-only safety boundary in the demo UI.
- Browser verification that no `/api/*` call is made on initial static demo load.

### Deliverables

1. Add demo safety boundary in the UI
   - The first screen must visibly state:
     - `Training-only simulator`
     - `Not for operational ATC, navigation, dispatch, or safety-critical use`

2. Add demo documentation
   - `docs/demo.md`
   - Explain:
     - demo URL
     - demo scope
     - what the demo can and cannot do
     - training-only boundary
     - public-safe data boundary

3. Add README demo entry
   - Add `Live Demo` section near the top.
   - Link to the hosted demo.
   - Keep the disclaimer near the demo link.

4. Add deployment workflow or deployment documentation
   - For GitHub Pages:
     - `.github/workflows/deploy-demo.yml`
   - For Netlify or Vercel:
     - platform config as needed
     - documented build command
     - documented publish directory

5. Verify browser behavior
   - Build production app.
   - Open demo locally or on hosted URL.
   - Confirm:
     - radar scope renders
     - screenshot-level visual state is nonblank
     - no browser console errors
     - safety boundary is visible
     - no private/generated data is served

### Phase 2 Verification

Run:

```powershell
cd jeju-radar-ui
npm ci
npm audit --audit-level=moderate
npm run build
npm run verify:public
```

Then inspect the built or hosted app with a browser:

- page loads
- radar scope renders
- visible training-only disclaimer exists
- no console errors
- no private file paths or secrets appear

### Phase 2 Completion Criteria

- Public demo URL exists.
- README links to the demo.
- Demo page visibly states training-only/non-operational boundary.
- Demo build uses only public-safe data.
- Deployment is repeatable or documented.
- GitHub Actions passes after the demo work.
- `v0.2.0 Public Demo` release is created.

## Explicit Non-Goals Before v0.2.0

Do not implement the AI pilot runtime yet.

AI pilot work belongs in `v0.3.0` because it requires:

- server-side API key boundary
- prompt and response policy
- phraseology guardrails
- hallucination fallback strategy
- training log and debrief behavior
- explicit non-operational boundary

Do not expand to enroute or ACC mode before the demo and operations baseline are complete.

## Suggested Release Sequence

```text
v0.1.0 Public Release Candidate
  already completed

v0.1.1 Maintainer Operations
  roadmap, maintainer docs, templates, labels, milestones, scheduled CI, Dependabot

v0.2.0 Public Demo
  hosted demo, demo disclaimer, demo docs, deployment workflow

v0.3.0 AI Pilot Runtime Prototype
  server-side training-only AI pilot boundary and phraseology guardrails
```

## Execution Rule for Future Agents

When executing this plan:

1. Read `AGENTS.md`, `README.md`, `ROADMAP.md`, and this file first.
2. Verify current GitHub state before making assumptions.
3. Work in release-sized chunks.
4. Do not skip verification.
5. Do not publish or deploy anything that weakens the training-only boundary.
6. Report exactly what changed, what passed, and what remains.
