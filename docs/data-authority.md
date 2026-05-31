# Data Authority

The simulator uses public-safe training data with explicit authority labels. The purpose is to prevent approximate or reference-only data from being mistaken for operational aviation data.

## Authority Levels

- `coordinate_verified`: verified against an explicit coordinate authority chain.
- `derived_coordinate`: computed from documented source values or verified coordinates.
- `training_runtime_route`: acceptable for deterministic training behavior but not claimed as exact published geometry.
- `reference_overlay_only`: visual/reference layer only; must not drive aircraft motion.
- `visual_reference_only`: display aid only; not a numeric authority.
- `blocked_missing_source`: not usable until source evidence is resolved.

## Runtime Rule

Only data that is authorized for training runtime may drive aircraft route queues, motion, or procedure execution. Reference overlays can be displayed for context but must not become motion authority.

## AIP-Derived Values

Some reference values, procedure identifiers, route structures, coordinates, or validation metadata may be derived from publicly accessible aeronautical information publications or other upstream public sources.

This repository does not grant a new license to the underlying upstream source material. AIP-derived values are included only as minimized training-simulator fixtures with source traceability and operational disclaimers.

## Source Text Rule

Use source identifiers, short section labels, and source links where traceability is needed. Avoid copied source passages in public fixtures. When source evidence is needed for maintainers, keep it outside the public release surface unless redistribution is clearly permitted.

## Conventional/RADAR SID Policy

Conventional and RADAR SID data is handled conservatively:

- Exact runtime routes stay blocked until chart linework and route centerline authority are reconciled.
- Training runtime paths may be enabled only when explicitly marked as training routes.
- Candidate chart linework is reference overlay only unless a stronger authority gate passes.

See `CONVENTIONAL_RADAR_SID_RUNTIME_POLICY.md` for the detailed policy.
