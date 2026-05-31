# Data Sources

This repository includes only public-safe derived data needed to run the browser training simulator and its deterministic verification checks.

## Included Source Classes

- Public aviation reference material used to derive non-operational RKPC training data.
- Public coastline/background map data reduced for browser display.
- Synthetic or derived scenario seed data.
- Public-safe phraseology and parser contract data.

## Excluded Source Classes

- Private PDFs, local SOPs, training manuals, internal notes, and local-only evidence.
- Raw source documents that are not licensed or prepared for redistribution.
- Actual/private ATC instruction corpora.
- Local secrets and environment files.
- Generated build output, verification output, temporary workspaces, and vendored toolchains.
- Oversized source geometry such as the full raw coastline extract.

## Authority Labels

Data must distinguish these roles:

- `coordinate_verified`: coordinate-bearing data used by deterministic checks.
- `coordinate_verified_subset`: selected training/display geometry derived from verified coordinates.
- `display_background_simplified_public_dataset`: visual background data, not an exact navigation source.
- `training_runtime_route`: non-operational route data used only for simulator behavior.
- `reference_overlay_only`: chart-like visual reference that must not drive aircraft motion.

Conventional/RADAR SID runtime authority is governed by [CONVENTIONAL_RADAR_SID_RUNTIME_POLICY.md](CONVENTIONAL_RADAR_SID_RUNTIME_POLICY.md). That policy keeps reference overlays separate from training runtime routes and blocks exact runtime routing unless the required authority is present.

## Public Verification Boundary

Public verification must run from files present in this repository after `npm install`; it must not require private source documents or local-only corpora.
