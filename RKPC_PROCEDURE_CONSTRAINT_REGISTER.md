# RKPC Procedure Constraint Register

기준: KOCA eAIP 30 APR 2026, AIP AMDT 5/26.

이 문서는 구현 전에 참조하는 절차 데이터 장부다. 기계가 읽는 원본은 `data/reference/rkpc_procedure_constraint_register.json`이고, 앱 런타임 복사본은 `jeju-radar-ui/public/reference/rkpc_procedure_constraint_register.json`이다.

## Coverage

- Modeled procedures: 35
- APP: 10
- SID: 13
- STAR: 12
- Route rows represented: 260
- Supplemental unmodeled conventional/RADAR procedures: 9
- Total cataloged procedures: 44

## Important Interpretation Rules

- Every STAR/SID route row currently present in rkpc_procedure_waypoint_turn_register is represented, including rows with no altitude or speed restriction.
- APP rows are represented from existing initial/final fix references until a full APCH coding-table row register is built.
- STAR/APP structured altitude and speed constraints come from rkpc_vertical_profiles.json. STAR AIP `@` speed is a managed maintain target unless controller speed mode is active; holding speed limits remain maximum speeds.
- SID constraints are preserved from AIP-derived procedure text and partially parsed into climb, altitude, speed, and turn fields. The RNAV SID fix constraints and procedure-level climb gradients copied into `rkpc_vertical_profiles.json` are authorized for managed guidance; remaining turn/bank, conventional SID, and RADAR SID rows require row-level audit before automation.
- Blank altitude/speed on a route row means no explicit new published value on that row. In STAR coding tables, altitude `-` after a prior `@` altitude carries that maintain altitude forward until the next explicit altitude constraint.
- Controller-assigned altitude/speed/heading remains operationally authoritative in the simulator; this register is reference data for managed procedure behavior.
- Conventional and RADAR SID procedures not yet modeled as route rows are preserved under supplemental_unmodeled_procedures with `automation_status=blocked_pending_row_audit`.
- KAMIT 2E CA @1 000 ft is represented as a pseudo route event, not a navigable fix.
- STAR bank-angle rules are preserved as procedure-level constraints and should not override controller-assigned heading/altitude/speed.

## Procedure Index

| Procedure | Type | RWY | Route rows | Constraint cells | Data quality |
|---|---:|---:|---:|---:|---|
| `RNAV_DOTOL_2P` | STAR | 07 | 15 | 17 | complete_route_rows_with_structured_star_constraints_current_source |
| `RNAV_UPGOS_1P` | STAR | 07 | 16 | 18 | complete_route_rows_with_structured_star_constraints_current_source |
| `RNAV_TAMNA_2P` | STAR | 07 | 15 | 19 | complete_route_rows_with_structured_star_constraints_current_source |
| `RNAV_TOSAN_2P` | STAR | 07 | 15 | 20 | complete_route_rows_with_structured_star_constraints_current_source |
| `RNAV_SOSDO_2P` | STAR | 07 | 15 | 20 | complete_route_rows_with_structured_star_constraints_current_source |
| `RNAV_LIMDI_1P` | STAR | 07 | 17 | 20 | complete_route_rows_with_structured_star_constraints_current_source |
| `RNAV_DOTOL_2M` | STAR | 25 | 11 | 20 | complete_route_rows_with_structured_star_constraints_current_source |
| `RNAV_UPGOS_2M` | STAR | 25 | 10 | 14 | complete_route_rows_with_structured_star_constraints_current_source |
| `RNAV_TAMNA_2M` | STAR | 25 | 11 | 14 | complete_route_rows_with_structured_star_constraints_current_source |
| `RNAV_TOSAN_2M` | STAR | 25 | 12 | 16 | complete_route_rows_with_structured_star_constraints_current_source |
| `RNAV_SOSDO_2M` | STAR | 25 | 12 | 16 | complete_route_rows_with_structured_star_constraints_current_source |
| `RNAV_LIMDI_2M` | STAR | 25 | 12 | 15 | complete_route_rows_with_structured_star_constraints_current_source |
| `RNAV_KAMIT_2E` | SID | 07 | 4 | 3 | complete_route_rows_with_sid_constraints_text_and_partial_structure |
| `RNAV_AKPON_1E` | SID | 07 | 2 | 1 | complete_route_rows_with_sid_constraints_text_and_partial_structure |
| `RNAV_TAMNA_2E` | SID | 07 | 2 | 1 | complete_route_rows_with_sid_constraints_text_and_partial_structure |
| `RNAV_PANSI_2E` | SID | 07 | 5 | 5 | complete_route_rows_with_sid_constraints_text_and_partial_structure |
| `RNAV_LIMDI_1E` | SID | 07 | 5 | 5 | complete_route_rows_with_sid_constraints_text_and_partial_structure |
| `RNAV_KAMIT_1W` | SID | 25 | 5 | 3 | complete_route_rows_with_sid_constraints_text_and_partial_structure |
| `RNAV_IPDAS_1W` | SID | 25 | 5 | 4 | complete_route_rows_with_sid_constraints_text_and_partial_structure |
| `RNAV_AKPON_1W` | SID | 25 | 6 | 2 | complete_route_rows_with_sid_constraints_text_and_partial_structure |
| `RNAV_TAMNA_3W` | SID | 25 | 6 | 2 | complete_route_rows_with_sid_constraints_text_and_partial_structure |
| `RNAV_PANSI_2W` | SID | 25 | 2 | 0 | complete_route_rows_with_sid_constraints_text_and_partial_structure |
| `RNAV_LIMDI_1W` | SID | 25 | 3 | 0 | complete_route_rows_with_sid_constraints_text_and_partial_structure |
| `RNAV_KAMIT_2N` | SID | 31 | 6 | 5 | complete_route_rows_with_sid_constraints_text_and_partial_structure |
| `RNAV_AKPON_1N` | SID | 31 | 6 | 3 | complete_route_rows_with_sid_constraints_text_and_partial_structure |
| `ILS_Z_LOC_Z_RWY_07` | APP | 07 | 4 | 4 | approach_rows_from_initial_final_fixes_with_partial_constraints |
| `ILS_Y_LOC_Y_RWY_07` | APP | 07 | 5 | 0 | approach_rows_from_initial_final_fixes_with_partial_constraints |
| `RNP_Z_RWY_07` | APP | 07 | 4 | 3 | approach_rows_from_initial_final_fixes_with_partial_constraints |
| `RNP_Y_RWY_07` | APP | 07 | 4 | 3 | approach_rows_from_initial_final_fixes_with_partial_constraints |
| `VOR_RWY_07` | APP | 07 | 6 | 0 | approach_rows_from_initial_final_fixes_with_partial_constraints |
| `ILS_Z_LOC_Z_RWY_25` | APP | 25 | 2 | 2 | approach_rows_from_initial_final_fixes_with_partial_constraints |
| `ILS_Y_LOC_Y_RWY_25` | APP | 25 | 6 | 0 | approach_rows_from_initial_final_fixes_with_partial_constraints |
| `RNP_Z_RWY_25` | APP | 25 | 3 | 2 | approach_rows_from_initial_final_fixes_with_partial_constraints |
| `RNP_Y_RWY_25` | APP | 25 | 3 | 2 | approach_rows_from_initial_final_fixes_with_partial_constraints |
| `VOR_RWY_25` | APP | 25 | 5 | 0 | approach_rows_from_initial_final_fixes_with_partial_constraints |

## Supplemental Unmodeled Procedures

아래 절차는 AIP 원문에서 식별했지만 아직 경로 row/좌표 기반 autopilot 절차로 만들지 않았다. 삭제하지 않고 장부에 보존하며, `verify:sid-row-audit`로 런타임 modeled procedure와 섞이지 않는지 확인한다.

| Procedure | RWY | Type | Automation status |
|---|---:|---|---|
| `IPDAS_4K` | 07 | conventional_unmodeled | blocked_pending_row_audit |
| `MAKET_4K` | 07 | conventional_unmodeled | blocked_pending_row_audit |
| `TAMNA_2K` | 07 | conventional_unmodeled | blocked_pending_row_audit |
| `CJU_5K` | 07 | conventional_unmodeled | blocked_pending_row_audit |
| `CJU_3L` | 25 | conventional_unmodeled | blocked_pending_row_audit |
| `IPDAS_1L` | 25 | conventional_unmodeled | blocked_pending_row_audit |
| `RADAR_2E` | 07 | radar_vector_unmodeled | blocked_pending_row_audit |
| `RADAR_3W` | 25 | radar_vector_unmodeled | blocked_pending_row_audit |
| `RADAR_1N` | 31 | radar_vector_unmodeled | blocked_pending_row_audit |

## Operational Notes

- RWY07 DOTOL 2P: `BIROM @7000` 이후 altitude `-` row는 `PIMIK @7000` 전까지 7000 maintain으로 carry-forward한다. `MANBA`부터 `PIMIK`까지 220 kt maintain, `YUMIN +4000 @195`이다.
- RWY07 UPGOS/TAMNA/TOSAN/SOSDO/LIMDI P-series: `MANBA @9000 @220` 이후 altitude `-` row는 `PIMIK @9000` 전까지 9000 maintain으로 carry-forward한다. 중간 PC row는 220 kt maintain, `YUMIN +4000 @195`이다.
- RWY25 DOTOL 2M: `VEKDI @7000` 이후 altitude `-` row는 `LIDVO @7000` 전까지 7000 maintain으로 carry-forward한다. `DOKVU-PC685`는 220 kt maintain, `DUKAL +4000 @195`이다.
- RWY25 UPGOS/TAMNA/TOSAN/SOSDO/LIMDI M-series: `DOKVU @9000 @220` 이후 altitude `-` row는 `LIDVO @9000` 전까지 9000 maintain으로 carry-forward한다. `PC682-PC685`는 220 kt maintain, `DUKAL +4000 @195`이고 procedure별 upstream 제한이 별도로 있다.
- RWY07 KAMIT 2E는 `CA @1000`을 pseudo route event로 보존했고, `OLLEH -10000`, `KAMIT +FL140`을 fix row에 붙였다.
- RNAV SID climb gradient 중 `rkpc_vertical_profiles.json`에 복사한 절차 단위 값은 managed guidance의 ft/NM feasibility check에 사용한다. 남은 turn/bank 제한과 conventional/RADAR SID는 row-level audit 후에만 자동화한다.
- APP는 현재 initial/final fix 기반 fallback row다. ILS/RNP/VOR 전체 coding-table, stepdown, missed approach는 별도 row register가 필요하다.

## Manual Digitization Backlog

### SID row audit (high)

- Confirm every RNAV SID coding-table row against _tmp_rkpc_sid_2026_04_30.txt, including CA/CF/DF/TF path descriptors.
- Digitize conventional IPDAS/MAKET/TAMNA/CJU and RADAR SID route rows before they are used for autopilot routing. The pre-digitization geometry requirements are locked in `data/authority/rkpc_conventional_radar_sid_geometry_audit.json`.
- `IPDAS_4K_YDM_R067_D6_5`, `IPDAS_4K_CJU_R013_D30`, `IPDAS_4K_CJU_R013_D30_TO_IPDAS`, `IPDAS_4K.turn_capture_model`, and `IPDAS_4K.runtime_path` are partial derived geometry/continuation/tolerance/runtime-training entries stored in `data/authority/rkpc_conventional_radar_sid_derived_geometry.json`; they enable a training pseudo-fix route for RWY07 IPDAS while exact route authorization remains blocked.
- Expand climb-gradient capability checks beyond the currently modeled RNAV SID subset only after conventional/RADAR SID route rows and segment-specific audit are complete.

### APP coding table (high)

- Build full APCH coding-table row register for ILS/LOC, RNP, VOR procedures instead of initial/final-fix fallback rows.
- Separate mandatory crossing altitude from vertical profile advisory altitudes and LOC-only stepdown fixes.
- Digitize missed approach route, altitude, speed, hold, and go-around trigger behavior.

### STAR holding and turn rules (medium)

- Expand holding rows into separate HM rows with turn direction, leg time, altitude block, and maximum holding speed.
- Use bank-angle segment rules for path shaping only after turn anticipation/fly-by model is finalized.

## Files

- Machine register: `data/reference/rkpc_procedure_constraint_register.json`
- Public copy for app/runtime: `jeju-radar-ui/public/reference/rkpc_procedure_constraint_register.json`
- SID/STAR route coverage register: `data/authority/rkpc_sid_star_route_register.csv`
- Conventional/RADAR SID geometry audit: `data/authority/rkpc_conventional_radar_sid_geometry_audit.json`
- Conventional/RADAR SID derived geometry: `data/authority/rkpc_conventional_radar_sid_derived_geometry.json`
- Existing managed profile defaults: `data/reference/rkpc_vertical_profiles.json` and `data/reference/rkpc_flight_profiles.json`
- Existing route/turn register: `data/authority/rkpc_procedure_waypoint_turn_register.json`
