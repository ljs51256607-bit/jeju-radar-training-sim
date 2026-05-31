# Conventional/RADAR SID Runtime Policy

## Purpose

This policy fixes how the simulator treats RKPC conventional/RADAR SID procedures when source text, radial/DME math, and published chart linework do not reconcile.

The short rule is:

- `exact runtime route` requires an exact route centerline authority.
- `training runtime route` may use audited text/radial/DME geometry when explicitly allowed.
- `reference overlay` may show candidate `source chart linework`, but it must not drive aircraft motion.

## Current Source Set

Current local source-of-truth files for this policy:

- `<private-source-redacted>`
- `data/authority/rkpc_conventional_radar_sid_geometry_audit.json`
- `data/authority/rkpc_conventional_radar_sid_derived_geometry.json`
- `data/authority/rkpc_conventional_radar_sid_exact_linework_audit.json`
- `data/authority/rkpc_sid_page3_ipdas_4k_linework_reconciliation_audit.json`

Within the current source set, no separate authority confirms that the chart-drawn IPDAS 4K route line is exact geodetic geometry. The page 3 SVG frame-tick georeference and linework reconciliation classify the selected chart line as `schematic_or_offset_not_geodetic_exact`.

## Runtime Classes

### 1. Exact Runtime Route

An `exact runtime route` may control aircraft motion only when every required leg has coordinate authority:

- source text is verified
- radial/DME/fix endpoints are derived or coordinate-verified
- chart linework is georeferenced by an exact authority
- D6.5 cut point is reconciled
- D30.0 and IPDAS are reconciled to the same exact route centerline
- turn/intercept source linework is validated
- `exact_runtime_route_allowed=true` is explicitly set by the gate

For IPDAS 4K, the current state is `exact_runtime_route_allowed=false`.

### 2. Training Runtime Route

A `training runtime route` may control aircraft motion when the route is useful for scenario flow but is not exact chart automation.

For IPDAS 4K, the allowed training route is:

- YDM R067/D6.5
- constructed CJU R013/D15.0 intercept
- CJU R013/D30.0
- IPDAS

This route is allowed only because `training_runtime_path_allowed=true` is set in `data/authority/rkpc_conventional_radar_sid_derived_geometry.json`. It remains a training path, not an exact published route.

### 3. Reference Overlay

A `reference overlay` may display candidate source chart linework for controller orientation and audit review.

Rules:

- reference overlay geometry is not source-of-truth for aircraft motion
- reference overlay geometry must not set route queue fixes
- reference overlay geometry must not clear exact gate blockers
- reference overlay labels should disclose candidate/reference status where practical

The IPDAS 4K page 3 chart line is currently reference overlay material only.

## IPDAS 4K Decision

Current reconciliation evidence:

- R013 chart line course error: about 0.27 deg versus expected true course 005
- D30.0 lateral offset: about 8.2 NM
- IPDAS lateral offset: about 8.2 NM
- D6.5 lateral offset: about 4.0 NM
- validated source turn/intercept centerline: missing

This means the selected chart line is nearly parallel to the intended course, but laterally offset. It cannot be treated as exact geodetic linework.

Therefore:

- `exact_runtime_route_allowed=false`
- `training_runtime_path_allowed=true`
- reference overlay may remain candidate-only

## Promotion Rule

To promote any conventional/RADAR SID from training/reference status to exact runtime status, add a new authority artifact that proves all of these:

- exact route centerline authority exists
- all radial/DME/fix projected points reconcile to that authority
- D6.5 and other cut points are exact, not candidate-only
- turn/intercept shape is validated from source linework or another exact authority
- relevant verifier commands pass

Until then, conventional/RADAR SID automation must stay conservative: training route for flow, reference overlay for visual context, exact route blocked.
