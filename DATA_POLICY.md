# Data Policy

## Purpose

This repository uses data to support a browser-based radar training simulator. The data policy exists to separate public, derived, and verifiable simulator data from private source material and local-only evidence.

## Core Rule

Only data that is safe to redistribute may be committed to the public repository.

When in doubt, do not commit the file.

## Allowed Data

Allowed data may include:

- Derived JSON, CSV, or GeoJSON created for simulator runtime
- Coordinate authority registers with clear provenance
- Scenario seeds and synthetic training flows
- Publicly documented metadata needed for verification
- Small reference geometry needed by the app
- Generated data that can be rebuilt from public-safe sources

Allowed data must avoid embedding private source documents, full source PDFs, local secrets, or excessive copied source text.

Public-source-derived aeronautical reference data may be included only when it is minimized for simulator use, carries source traceability, avoids long copied passages, and is not presented as newly relicensed upstream data.

## Blocked Data

The public repository must not include:

- API keys or local credential files
- Private SOP PDFs
- Training manuals that are not clearly redistributable
- Tacit/local notes that were not written for public release
- Raw source PDFs unless redistribution is clearly permitted
- Local runtime folders
- Dependency folders such as `node_modules`
- Build outputs such as `dist`, `build`, `output`, and synced `public`
- Oversized raw geometry such as `data/geometry/coastline_lines.geojson`

## Geometry Authority Levels

Geometry and procedure data must preserve its authority level.

- `coordinate_verified`: verified against an explicit coordinate authority chain
- `derived_coordinate`: computed from documented source values or verified coordinates
- `training_runtime_route`: acceptable for training behavior but not claimed as exact published geometry
- `reference_overlay_only`: visual/reference layer only; must not drive aircraft motion
- `visual_reference_only`: display aid only; not a numeric authority
- `blocked_missing_source`: not usable until source evidence is resolved

The simulator must not label approximate, candidate, schematic, or visual-reference geometry as exact.

## Exact vs Training vs Reference

Exact data can be used only when source traceability and validator coverage are sufficient.

Training data may be used for deterministic simulator behavior when it is clearly labeled as training data and not presented as exact operational geometry.

Reference-only data may be displayed for context, but it must not control aircraft motion or procedure execution.

## Public Verification

The public repository should prefer verification commands that run without private source files. Commands that require local PDFs or private evidence belong in maintainer-local notes, not in the default public verification path.

## Local Voice/PTT Traces

The browser UI may create local PTT/STT trace exports for developer testing. These traces can contain user-spoken microphone transcripts, parser debug text, latency values, and local labels.

Voice/PTT traces are local evidence, not source data. Do not commit exported trace JSON, live sample-session payloads, or private voice/PTT corpus material to this repository.

## Source Text Handling

Short source identifiers, section labels, and provenance fields are acceptable when needed for traceability.

Do not copy large passages from source documents into repository data. Do not include private source excerpts in public JSON fixtures or test cases.

When source material is publicly viewable but not clearly open-licensed, prefer derived facts, identifiers, short labels, and source links over copied source text. Do not mark AIP-derived values as CC BY 4.0 unless the upstream license clearly permits that reuse.

## Secrets

Secrets must stay out of the repository.

The repository must keep ignore rules and secret scans for common secret patterns including API key files, `.env` files, provider API key environment markers, bearer tokens, and provider key-like strings.
