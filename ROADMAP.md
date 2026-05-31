# Roadmap

This roadmap is intentionally conservative. The goal is to publish a safe, verifiable training simulator before expanding scope.

## Phase 0: OSS Staging Controls

Status: in progress

- Migration control document
- Blocklist and allowlist
- Public disclaimer
- Data policy
- Git ignore policy
- Repo skeleton
- Secret and size audit rules

## Phase 1: Public Minimal Build

Goal: selected source, data, and scripts can build without private source files.

- Copy public-safe app source
- Copy public-safe derived data
- Exclude raw PDFs, local secrets, generated output, and oversized raw geometry
- Run `npm install`
- Run TypeScript check
- Run production build
- Run secret scan

## Phase 2: Core Verification Baseline

Goal: the public repo has a small but meaningful verification baseline.

- Procedure route progression checks
- Aircraft motion checks
- Arrival stream checks
- Scenario preset checks
- Coordinate authority checks that do not require private source files
- Phraseology contract checks with public-safe fixtures

## Phase 3: Documentation Hardening

Goal: a reviewer can understand the project in minutes.

- Architecture overview
- Data source and authority explanation
- Verification guide
- Scenario guide
- Contributor guide
- Maintainer-local verification notes, separated from public verification

## Phase 4: Release Candidate

Goal: the repo is ready for public GitHub release and OpenAI Codex OSS support application.

- License decision
- Data license decision
- Full secret scan
- File-size audit
- README polish
- Initial issue labels
- First release tag
- Support application summary

## Later Scope

These are not Phase 1 goals.

- Multi-airport framework
- Additional reference airports
- Full voice/STT quality certification
- Multi-user training sessions
- Weather avoidance scenarios
- Certified simulator behavior

