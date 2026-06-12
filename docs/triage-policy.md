# Triage Policy

This document explains how issues and pull requests should be classified.

## Required Labels for Actionable Issues

Every actionable issue should have:

- one `area:*` label
- one `type:*` label
- one `priority:*` label

Use `status:*` labels only when they add useful workflow state.

## Area Labels

- `area:ai-pilot`: AI pilot runtime, readbacks, response policy, server-side model boundary.
- `area:demo`: hosted demo, deployment workflow, demo documentation, demo safety banner.
- `area:phraseology`: parser, response policy, voice tolerance, phraseology scoring.
- `area:data-authority`: source boundary, coordinate authority, derived/reference/training labels.
- `area:scenario`: scenario presets, replay, debrief, traffic flows.
- `area:docs`: README, maintainer docs, release notes, policy docs.
- `area:ci`: GitHub Actions, Dependabot, verification automation.

## Type Labels

- `type:feature`: new user-facing or maintainer-facing capability.
- `type:maintenance`: upkeep, CI, docs hygiene, release operations.
- `type:question`: needs clarification before implementation.

## Priority Labels

- `priority:p1`: needed for the next major release target or a safety/data-boundary concern.
- `priority:p2`: important but not blocking the next release.
- `priority:p3`: useful later, not immediate.

## Status Labels

- `status:ready`: the next action is clear.
- `status:blocked`: progress requires missing information, external access, or a policy decision.

## Milestone Policy

- `v0.1.1 Maintainer Operations`: maintainer docs, templates, labels, milestones, scheduled CI, Dependabot.
- `v0.2.0 Public Demo`: hosted demo, demo safety boundary, demo docs, deployment workflow.
- `v0.3.0 AI Pilot Runtime Prototype`: training-only AI pilot boundary and phraseology guardrails.

Do not assign AI pilot implementation work to `v0.2.0`. The public demo must ship first.

## Closing Criteria

An issue can be closed when:

- the requested change is merged or intentionally rejected,
- relevant verification passed,
- release notes or docs were updated when needed,
- the training-only boundary remains intact.
