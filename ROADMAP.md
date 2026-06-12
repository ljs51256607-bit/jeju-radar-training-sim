# Roadmap

This roadmap is intentionally conservative. The project should become easier to inspect, verify, and maintain before it expands into larger simulator capabilities.

## Current Status

`v0.1.0 Public Release Candidate` is complete.

The repository is public, has a first release tag, includes a radar scope screenshot, and runs repeatable verification through GitHub Actions. The public release surface is still training-only and excludes private source material, generated folders, local evidence, secrets, and oversized raw geometry.

## Completed in v0.1.0

- Public-safe repository boundary.
- README, screenshot, disclaimer, data policy, data license boundary, security policy, and public documentation.
- Browser-based radar training UI under `jeju-radar-ui/`.
- Public-safe reference, authority, geometry, and scenario data.
- Coordinate authority validation.
- Procedure guidance, motion-model, arrival-stream, scenario, and selected SID/STAR verification.
- Phraseology contract, parser checks, pilot response policy checks, and voice tolerance cases.
- GitHub Actions `Verify` workflow.
- Initial public roadmap issues.

## Completed in v0.1.1

- Maintainer operating policy.
- Support policy.
- Release process documentation.
- Triage policy documentation.
- GitHub issue templates.
- Pull request template.
- Dependabot configuration.
- Manual and scheduled verification workflow triggers.
- Organized labels, milestones, and existing issues.

## v0.2.0 Public Demo

Goal: make the simulator directly inspectable through a hosted, training-only public demo.

- Use GitHub Pages as the free-first static deployment path.
- Add a visible demo safety boundary in the UI.
- Add demo documentation.
- Add README `Live Demo` link.
- Add repeatable deployment workflow.
- Verify the hosted demo in a browser before release.

## v0.3.0 AI Pilot Runtime Prototype

Goal: introduce the first training-only AI pilot runtime boundary after the public demo is stable.

Planned:

- Keep API keys server-side.
- Use the phraseology contract and pilot response policy as guardrails.
- Log generated pilot responses as training artifacts, not operational guidance.
- Add deterministic fixtures for readback and response-policy behavior.
- Preserve the non-operational, training-only boundary.

## Later Scope

These items remain outside the current release targets:

- Multi-airport framework.
- Additional reference airports.
- Enroute and ACC training modes.
- Multi-user training sessions.
- Weather avoidance scenarios.
- Certified simulator behavior.
- Full voice/STT quality certification.

## Non-Goals

- Do not use this project for real-world ATC, navigation, dispatch, certification, or safety-critical decision making.
- Do not add private SOPs, PDFs, training manuals, tacit notes, local-only evidence, secrets, generated folders, or oversized raw geometry.
- Do not implement the AI pilot runtime before the public demo and maintainer operations baseline are complete.
