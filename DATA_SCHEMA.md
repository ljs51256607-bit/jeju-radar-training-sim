# 제주 접근관제 시뮬레이터 데이터 스키마

## 1. 목적

이 문서는 문서/차트에서 뽑은 정보를 어떤 구조로 저장할지 고정한다.

원칙은 두 가지다.

1. 문서 원문을 잃지 않는다.
2. 시뮬레이터가 읽기 쉽게 정규화한다.

## 2. 공통 규칙

### 2.1 저장 형식

- 저장 형식은 UTF-8 `JSON`
- 중간 수집본은 `CSV`를 허용하지만, 최종 기준본은 JSON으로 통일

### 2.2 공통 메타 필드

모든 최종 객체는 아래 필드를 가진다.

| 필드 | 의미 |
|---|---|
| `id` | 내부 고유 식별자 |
| `name` | 원문 이름 |
| `source_file` | 원천 문서 파일명 |
| `source_section` | 조문/차트/표/절차명 등 출처 위치 |
| `source_text` | 필요한 경우 원문 문자열 |
| `notes` | 해석 메모 |

### 2.3 좌표 규칙

좌표는 아래 두 형식을 함께 보존한다.

| 필드 | 형식 |
|---|---|
| `lat` | decimal degrees |
| `lon` | decimal degrees |
| `coord_text` | 원문 좌표 문자열 |

### 2.4 고도/속도/방위 규칙

- 고도 기본 단위: `feet`
- 명시되지 않으면 `AMSL`로 기록
- `AGL`은 별도 필드 `altitude_reference`에 명시
- 속도 단위: `kt`
- 방위/코스는 차트 발간값 우선, `magnetic` 기준을 기본으로 둔다
- `true_course`가 있는 경우 추가 보존

## 3. 기준 출력 파일

이번 프로젝트는 아래 파일 세트를 기준본으로 사용한다.

- `data/reference/rkpc_airport.json`
- `data/reference/rkpc_airspace.json`
- `data/reference/rkpc_procedures.json`
- `data/reference/rkpc_procedure_constraint_register.json`
- `data/reference/rkpc_flight_profiles.json`
- `data/reference/rkpc_vertical_profiles.json`
- `data/reference/rkpc_training_rules.json`
- `data/authority/rkpc_scenario_fix_role_register.json`
- `data/authority/rkpc_procedure_waypoint_turn_register.json`
- `data/authority/rkpc_conventional_radar_sid_geometry_audit.json`
- `data/authority/rkpc_conventional_radar_sid_derived_geometry.json`
- `data/scenarios/*.json`

## 4. 스키마 정의

### 4.1 `rkpc_airport.json`

공항 기본 제원과 고정 시설.

#### `runways`

| 필드 | 설명 |
|---|---|
| `runway` | 예: `07`, `25`, `13`, `31` |
| `paired_runway` | 반대 방향 활주로 |
| `threshold` | threshold 좌표 객체 |
| `length_m` | 활주로 길이 |
| `width_m` | 활주로 폭 |
| `surface` | 아스팔트/콘크리트 등 |
| `elevation_ft` | threshold elevation |
| `lighting` | 접근등/활주로등 요약 |
| `remarks` | displaced threshold 등 특이사항 |

#### `frequencies`

| 필드 | 설명 |
|---|---|
| `service` | `APP`, `DEP`, `TWR`, `GND`, `DLVRY`, `ATIS`, `EMERG` |
| `callsign` | 예: `Jeju Approach` |
| `frequency_mhz` | 주파수 |
| `hours` | 운영시간 |
| `remarks` | 남쪽 유입 전용 등 비고 |

#### `navaids`

| 필드 | 설명 |
|---|---|
| `name` | 예: `YDM`, `CJU`, `ICJU`, `ICHE` |
| `type` | `VOR`, `DME`, `LOC`, `GP`, `IM`, `VORTAC` |
| `frequency` | 주파수 |
| `lat` / `lon` | 좌표 |
| `elevation_ft` | 해당 시 |
| `remarks` | unusable sector 등 |

### 4.2 `rkpc_airspace.json`

공역, 책임구역, handoff, MVA, hotspot.

#### `controller_positions`

| 필드 | 설명 |
|---|---|
| `code` | `CO`, `AP`, `AR`, `DC`, `AS` |
| `name` | 포지션 명칭 |
| `role_summary` | 핵심 책임 |
| `frequencies` | 사용하는 주파수 목록 |
| `handoff_in` | 인수 기준 |
| `handoff_out` | 인계 기준 |

#### `handoff_points`

| 필드 | 설명 |
|---|---|
| `from_unit` | 인계 기관/포지션 |
| `to_unit` | 인수 기관/포지션 |
| `fix_or_area` | 기준 지점/구역 |
| `altitude_ft` | 기준 고도 |
| `conditions` | traffic order, runway, radar/non-radar 등 |

#### `mva_sectors`

| 필드 | 설명 |
|---|---|
| `sector_id` | 내부 식별자 |
| `min_altitude_ft` | MVA 값 |
| `altitude_reference` | 기본 `AMSL` |
| `geometry` | polygon 좌표 배열 |
| `temperature_note` | 저온보정 여부 |

#### `hotspots`

| 필드 | 설명 |
|---|---|
| `hotspot_id` | 내부 식별자 |
| `runway_config` | `07`, `25`, 공통 등 |
| `geometry` | polygon 또는 line+buffer |
| `description` | 구역 설명 |
| `operational_note` | 감시 강화 등 |

### 4.3 `rkpc_procedures.json`

SID/STAR/Approach/Visual 절차.

#### `fixes`

| 필드 | 설명 |
|---|---|
| `name` | fix/navaid/waypoint |
| `type` | `IF`, `IAF`, `FAF`, `MAHF`, `MAPt`, `waypoint`, `holding_fix` 등 |
| `lat` / `lon` | 좌표 |
| `remarks` | source-specific note |

#### `sids`

| 필드 | 설명 |
|---|---|
| `name` | 절차명 |
| `runway_group` | 적용 활주로 |
| `procedure_family` | `RNAV`, `conventional` |
| `legs` | leg 배열 |
| `climb_requirements` | climb gradient, ATC purpose 등 |
| `exit_fix` | 주요 outbound fix |
| `remarks` | 절차 비고 |

#### `ProcedureRecord` 추가 규칙

| 필드 | 설명 |
|---|---|
| `runway` | 실제 절차 적용 활주로. 예: `07`, `25`, `31` |
| `paired_runway_mode` | UI mode와 실제 활주로가 다를 때 사용. 현재 `31` SID는 `25+31`에 묶는다 |
| `route_text` | AIP route summary 또는 coding table에서 확인한 fix sequence 문자열 |
| `extraction_status` | `coordinate_verified_current_aip_2026_04_30` 등 최신성/검증 상태 |

현재 기준:

- RWY07과 RWY25는 UI runway mode로 직접 선택한다.
- RWY31은 독립 UI mode가 아니라 `RWY25+31` 모드에서 같이 표시/사용한다.
- 공통 지도 레이어인 TMA, MVA, coastline, ATS route, MOA/CATA는 runway mode가 바뀌어도 그대로 쓴다.
- runway mode가 바뀔 때 교체되는 것은 STAR/SID/APP procedure layer와 procedure guidance 후보군이다.

### 4.4 `rkpc_procedure_waypoint_turn_register.json`

절차 waypoint별 FLY-BY / FLY-OVER 기준을 보존한다.

| 필드 | 설명 |
|---|---|
| `procedure_id` | 절차 ID |
| `procedure_type` | `STAR` 또는 `SID` |
| `runway` | 실제 절차 활주로 |
| `paired_runway_mode` | 필요한 경우 `25+31` |
| `sequence_index` | route sequence index |
| `fix_id` | waypoint/fix ID |
| `fly_over_source_value` | AIP coding table의 Fly-over 값 |
| `turn_behavior` | 현재는 `fly_by` 중심. HM holding row는 별도 후보 |

운영 규칙:

- AIP coding table normal route row에서 `Fly-over`가 `-`이면 `turn_behavior = fly_by`.
- HM holding row에서 `Fly-over = Y`인 것은 active route leg가 아니라 holding/fly-over 후보로 분리한다.
- wind correction 또는 향후 절차 path model 고도화 전까지는 이 register를 읽기 전용 기준 데이터로 둔다.
- 현재 runtime은 이 값을 이용해 active fix 전 미리 선회하지 않는다.
- 절차 수행은 active fix capture 후 `procedure_capture_transition`으로 다음 leg heading을 6초 동안 정렬한다. 이 transition은 runtime 상태이며, 기준 절차 데이터 자체를 바꾸지 않는다.

#### `stars`

| 필드 | 설명 |
|---|---|
| `name` | 절차명 |
| `runway_group` | 적용 활주로 |
| `entry_fix` | 주 entry fix |
| `merge_fix` | merge/sequence 핵심 지점 |
| `iaf_or_if` | terminal handoff 핵심 지점 |
| `legs` | leg 배열 |
| `holding` | hold 정보 |
| `remarks` | speed/bank angle note 등 |

#### `approaches`

| 필드 | 설명 |
|---|---|
| `name` | 예: `ILS Z RWY 07` |
| `runway` | 적용 활주로 |
| `type` | `ILS`, `LOC`, `RNP`, `VOR`, `Visual` |
| `category` | `CAT I`, `CAT II`, `RNP AR` 등 |
| `entry_fixes` | IAF/IF 목록 |
| `final_fixes` | FAF/FAP/SDF/MAPt 목록 |
| `missed_approach` | missed approach 절차 |
| `required_equipment` | DME/GNSS/RNP 등 |
| `limitations` | circling N/A, temperature 제한 등 |

#### `legs` 공통 구조

```json
{
  "seq": 1,
  "leg_type": "TF",
  "fix": "YUMIN",
  "course_deg_mag": 126.0,
  "course_deg_true": 118.3,
  "distance_nm": 5.0,
  "turn_direction": null,
  "altitude_min_ft": 4000,
  "altitude_max_ft": 7000,
  "altitude_window_text": "+4000 / -7000",
  "speed_max_kt": 230,
  "remarks": "IAF"
}
```

### 4.5 `rkpc_training_rules.json`

훈련 평가, tacit knowledge, 운용 메모.

#### `phraseology_rules`

- 포지션별 표준관제용어
- vector / speed / approach / handoff 관련 문구

#### `sequencing_rules`

- APP -> ARR usable handoff 감각
- IAF/IF 기준 간격 판단
- same-track / converging traffic 판단 포인트

#### `monitoring_rules`

- readback / hearback
- execution monitoring
- wide scan / focal overscan

#### `visual_approach_rules`

| 필드 | 설명 |
|---|---|
| `runway` | 적용 활주로 |
| `ceiling_rule` | 예: `MVA + 500 ft 이상` |
| `visibility_rule` | 예: `3 SM 이상` |
| `special_notes` | YDM 6DME outside alignment 등 |

### 4.6 `data/scenarios/*.json`

훈련 시나리오 템플릿.

#### 상위 구조

| 필드 | 설명 |
|---|---|
| `scenario_id` | 시나리오 식별자 |
| `name` | 시나리오 이름 |
| `runway_config` | `07`, `25`, mixed |
| `weather_profile` | visual, low ceiling 등 |
| `traffic_seed` | 초기 배치 항공기 |
| `spawn_rules` | 시간 경과에 따른 추가 트래픽 |
| `training_focus` | spacing, go-around recovery 등 |
| `success_checks` | 훈련 성공 체크 포인트 |

#### `traffic_seed`

| 필드 | 설명 |
|---|---|
| `callsign` | 훈련용 호출부호 |
| `type` | 기종 |
| `state` | `arrival`, `departure`, `missed_approach`, `overflight` |
| `position_mode` | `fix-offset`, `procedure-leg`, `latlon-direct` |
| `reference` | fix명 또는 절차명 |
| `distance_nm` | 기준점에서의 거리 |
| `heading_deg` | 필요 시 |
| `altitude_ft` | 시작 고도 |
| `speed_kt` | 시작 속도 |
| `assigned_procedure` | SID/STAR/IAP |
| `notes` | controller training note |

### 4.7 `data/authority/rkpc_scenario_fix_role_register.json`

입항/출항 stream 생성 기준 fix role register.

#### 기본 규칙

| 용어 | 의미 |
|---|---|
| `STAR entry fix` | STAR route의 첫 named fix |
| `SID exit fix` | RNAV SID의 마지막 주요 outbound fix |
| `conventional_gate` | 재래식 항로 기준 입항/출항 가능 fix |

SID의 첫 fix를 출항 fix라고 부르지 않는다. SID의 첫 fix는 `sid_initial_fix`, SID의 마지막 주요 outbound fix는 `sid_exit_fix`로 분리한다.

#### `fixes`

| 필드 | 설명 |
|---|---|
| `fix_id` | fix 이름 |
| `latitude` / `longitude` | decimal coordinate |
| `coordinate_status` | 좌표 검증 상태 |
| `scenario_roles` | `arrival_entry`, `departure_exit`, `conventional_gate` 배열 |
| `overlap_gate` | 입항/출항 role이 겹치는지 |
| `route_family` | `rnav_star_entry`, `rnav_sid_exit`, `conventional_gate` 등 |
| `arrival` | arrival stream 생성 가능 여부와 근거 |
| `departure` | departure stream 생성 가능 여부와 근거 |
| `notes` | 시나리오 해석 메모 |

현재 겹치는 fix:

- `LIMDI`
- `TAMNA`
- `IPDAS`
- `MAKET`

### 4.8 `data/reference/rkpc_geometry.json`

레이더 화면의 바닥 데이터와 geometry 추출 상태를 담는 기준 파일.

#### 상위 구조

| 필드 | 설명 |
|---|---|
| `reference_points` | radar site, ARP, YDM 같은 기준점 |
| `chart_guides` | concentric ring 중심, 차트 레전드 기반 규칙 |
| `runway_reference_geometry` | 활주로 중심선 같은 기초 선형 |
| `tower_handoff_reference_geometry` | Tower-APP handoff용 점/구간/거리 기준 |
| `visual_reference_geometry` | visual approach용 DME arc 등 |
| `interfacility_transfer_anchors` | 타 기관 이양용 anchor fix와 고도 |
| `hotspot_reference_zones` | Hot Spot의 anchor-only 정의 |
| `manual_digitization_backlog` | 아직 수동 digitize가 필요한 항목 |

#### `reference_points`

| 필드 | 설명 |
|---|---|
| `id` | 예: `RADAR_SITE` |
| `type` | `radar_site_center`, `airport_reference_point` 등 |
| `raw_coordinate` | 원문 좌표 |
| `latitude` | decimal latitude |
| `longitude` | decimal longitude |
| `reference_dataset` | 이미 다른 JSON에 있는 경우 참조 파일명 |
| `reference_key` | 참조 키 |

#### `manual_digitization_backlog`

| 필드 | 설명 |
|---|---|
| `id` | backlog 항목 식별자 |
| `kind` | `polygon`, `polygon_set`, `polyline_and_label_set` 등 |
| `priority` | `high`, `medium`, `low` |
| `reason` | 왜 필요한지 |
| `source_files` | 수동 digitizing에 써야 할 원천 파일 |

### 4.9 `data/reference/rkpc_flight_profiles.json`

항공기 기동 모델의 기본 운항값과 managed speed restriction 기준 파일.

| 필드 | 설명 |
|---|---|
| `default_profile_id` | 기본 적용 profile id |
| `profiles[].arrival.entry_speed_kt` | entry fix 입항 시 랜덤 속도 범위 |
| `profiles[].arrival.speed_gate` | 10000 ft 이하 하강 전 250 kt 감속 gate |
| `profiles[].arrival.procedure_speed_max_kt` | fix별 절차 속도 상한 |
| `profiles[].arrival.approach_phase_speed_max_kt` | initial/intermediate/final 단계별 속도 상한 |
| `profiles[].departure.below_10000_speed_kt` | DEP 10000 ft 이하 normal speed |
| `profiles[].departure.above_10000_speed_kt` | DEP 10000 ft 초과 normal speed |
| `profiles[].departure.initial_climb_fpm` | DEP normal climb 기본 상승률 |

중요 규칙:

- `rkpc_flight_profiles.json`의 phase/fallback 속도는 max restriction이다. STAR AIP `@` speed는 `rkpc_vertical_profiles.json`에서 managed maintain target으로 처리한다.
- APP/ARR `RESUME NORMAL SPEED`는 증속 명령이 아니라 controller SPD 해제다.
- DEP `RESUME NORMAL SPEED`는 climb speed profile 복귀다.

### 4.10 `data/reference/rkpc_vertical_profiles.json`

AIP STAR/IAP text에서 확정된 altitude/speed constraint를 절차 자동 수직 프로파일로 쓰기 위한 기준 파일.

| 필드 | 설명 |
|---|---|
| `default_profile_id` | 기본 적용 vertical profile id |
| `profiles[].glide_path_ft_per_nm` | ILS final v1에서 쓰는 3도 근사 하강 경로값. 기본 `318 ft/NM` |
| `profiles[].constraint_capture_ft` | constraint capture 허용 band |
| `profiles[].min_descent_fpm` / `max_descent_fpm` | managed descent 계산 제한 |
| `profiles[].min_climb_fpm` / `max_climb_fpm` | managed climb 계산 제한 |
| `profiles[].procedure_constraints[].procedure_id` | `rkpc_procedures.json`의 절차 id. composite STAR+ILS는 포함 문자열로 매칭 |
| `procedure_constraints[].procedure_level_constraints[]` | SID climb gradient처럼 특정 fix가 아니라 절차 전체나 고도까지 적용되는 제한 |
| `procedure_level_constraints[].climb_gradient_pct` | AIP chart의 minimum climb gradient percent. runtime에서는 `ft/NM`로 환산해 aircraft climb capability와 비교 |
| `procedure_level_constraints[].required_until_altitude_ft` | obstacle avoidance gradient처럼 특정 고도까지 적용되는 경우의 종료 고도 |
| `constraints[].fix_id` | constraint가 걸리는 fix |
| `constraints[].type` | `at`, `at_or_above`, `at_or_below`, `window` |
| `constraints[].altitude_ft` | 단일 고도 constraint |
| `constraints[].speed_kt` | 해당 fix의 STAR/APP managed speed. AIP `@` speed는 controller speed가 없을 때 maintain target으로 해석 |
| `constraints[].source_text` | AIP/TEXT에서 추출한 원문 요약 |

수직 모드 규칙:

- Aircraft state의 `vertical_procedure_mode`가 `cancel_level`이면 route와 speed restriction은 유지하되 STAR altitude restriction은 자동 하강 target으로 쓰지 않는다.
- `des_via`이면 STAR route/speed restriction은 유지하되, `star_via_clearance_altitude_ft`가 있을 때만 STAR altitude restriction을 수행한다.
- `approach`이면 ILS/APP profile이 우선하며 IAF/IF/FAF crossing altitude를 접근 정대용 target altitude로 쓴다.
- `controller`이면 관제사가 입력한 ALT/VS/HDG 계열 지시가 우선한다.

중요 규칙:

- `at_or_above`는 최저고도 보호용이다. `cancel_level` 또는 단순 DCT에서는 자동 하강 목표로 쓰지 않는다.
- STAR `des_via`의 `at_or_above`는 cleared altitude보다 낮게 내려가지 않도록 floor로 쓴다. 항공기가 이미 그 고도보다 낮으면 자동 상승 target을 만들지 않는다.
- STAR coding table에서 altitude `-`는 이전 `@` altitude maintain을 다음 explicit altitude constraint 전까지 carry-forward한다. 예: DOTOL 2P `BIROM @7000` 이후 `PIMIK` 전까지는 7000 maintain으로 해석한다.
- STAR AIP `@` speed는 maximum cap이 아니라 managed maintain target이다. 단, 관제사가 직접 SPD를 넣어 `speed_control_mode=controller`인 경우 관제 지시가 우선한다.
- `at_or_below`와 `at`은 필요한 경우 다음 constraint까지 남은 거리와 ground speed로 required vertical rate를 계산한다.
- SID climb gradient는 `% * 6076.12 / 100`으로 `ft/NM` 환산 후, 현재 planning ground speed에서 필요한 climb fpm과 aircraft performance cap을 비교한다.
- required descent가 너무 작으면 TOD 전으로 보고 현재 고도를 유지한다.

### 4.11 `data/reference/rkpc_procedure_constraint_register.json`

STAR/SID/APP 절차별 route row, fix/segment 고도 제한, 속도 제한, climb gradient, turn/bank 제한, source evidence, 미구현 conventional/RADAR SID를 한곳에 묶는 장부 파일.

| 필드 | 설명 |
|---|---|
| `metadata.authority_basis` | 기준 AIP package, effective date, source URL |
| `summary` | 모델링된 절차 수, 보충 미구현 절차 수, route row 수 |
| `procedures[]` | RNAV STAR/SID/APP 기준 절차 row |
| `procedures[].route_rows[]` | 절차 내 fix 또는 pseudo event 순서 |
| `route_rows[].altitude_constraints` | 해당 fix/event의 고도 제한 |
| `route_rows[].speed_constraints` | 해당 fix/event의 속도 제한. STAR AIP `@` speed는 managed maintain target으로 해석 |
| `procedures[].procedure_level_constraints` | climb gradient, bank angle, turn restriction 같은 절차 단위 제한 |
| `supplemental_unmodeled_procedures[]` | 아직 route row로 구현하지 않은 conventional/RADAR SID 보충 장부 |
| `supplemental_unmodeled_procedures[].automation_status` | 자동화 연결 상태. conventional/RADAR SID는 route row audit 전까지 `blocked_pending_row_audit` |
| `manual_digitization_backlog[]` | 자동화에 쓰기 전 수동 검증해야 할 작업 목록 |

운용 규칙:

- 이 파일은 “빠진 제한이 무엇인지”까지 보존하는 장부다. 앱 자동조종이 바로 전부 소비해도 된다는 뜻은 아니다.
- RNAV STAR의 고도/속도 제한은 현재 가장 구조화가 잘 되어 있다.
- RNAV SID는 현재 모델링된 SID의 fix altitude/speed와 published climb gradient를 자동조종에 연결했다. 다만 conventional/RADAR SID와 세부 turn/bank row는 별도 audit 대상이다.
- APP는 현재 IAF/IF/FAF 중심 fallback row다. LOC stepdown, missed approach, full APCH coding table은 별도 digitizing 대상이다.
- conventional/RADAR SID는 `supplemental_unmodeled_procedures`에 남겨두고, 경로 좌표가 완성되기 전에는 항공기 route queue로 쓰지 않는다. 이 금지는 `automation_status=blocked_pending_row_audit`와 `verify:sid-row-audit`로 검증한다.

### 4.12 `data/authority/rkpc_conventional_radar_sid_geometry_audit.json`

conventional/RADAR SID를 route queue로 올리기 전에 필요한 geometry derivation 작업을 절차별로 잠그는 장부 파일.

| 필드 | 설명 |
|---|---|
| `procedures[].procedure_id` | route register와 constraint register에 있는 conventional/RADAR SID 식별자 |
| `procedures[].route_definition_type` | `radial_dme`, `radial_dme_arc`, `radar_vector` |
| `procedures[].required_geometry_derivations[]` | 자동화 전에 필요한 계산 종류. 예: `radial_track`, `turn_or_intercept_geometry`, `dme_arc`, `arc_join_or_exit`, `runway_heading_vector`, `release_altitude` |
| `procedures[].audit_status` | 현재 audit 상태. 좌표 계산 전에는 `pending_geometry_derivation` |
| `procedures[].automation_status` | 자동화 연결 상태. 좌표 계산 전에는 `blocked_pending_geometry_derivation` |
| `procedures[].runtime_route_allowed` | runtime route queue 사용 가능 여부. audit 단계에서는 `false` |

운용 규칙:

- 이 파일은 “어떤 계산이 필요하다”를 고정하는 장부이며, 계산 결과 좌표가 아니다.
- `verify:sid-geometry-audit`는 이 파일이 route register와 supplemental backlog 9개를 모두 덮고, runtime route 사용을 막고 있는지 확인한다.

### 4.13 `data/authority/rkpc_conventional_radar_sid_derived_geometry.json`

conventional/RADAR SID 중 검증 가능한 일부 leg의 파생 좌표를 보존하는 장부 파일.

| 필드 | 설명 |
|---|---|
| `procedures[].derivation_status` | 파생 진행 상태. 부분 좌표만 있으면 `partial_*` 상태를 사용 |
| `procedures[].runtime_route_allowed` | exact runtime route queue 사용 가능 여부. 전체 chart linework 검증 전에는 `false` |
| `procedures[].magnetic_to_true_offset_deg` | magnetic radial을 true bearing으로 바꾸는 프로젝트 기준값. RKPC는 `-8` |
| `procedures[].derived_points[]` | radial/DME 등으로 계산한 파생 좌표 |
| `derived_points[].radial_magnetic_deg` | 차트 기준 magnetic radial |
| `derived_points[].bearing_true_deg` | 내부 좌표 계산에 사용한 true bearing |
| `derived_points[].distance_nm` | source navaid에서의 DME 거리 |

운용 규칙:

- 이 파일의 좌표는 exact 자동화 후보 좌표다. `runtime_path.training_runtime_path_allowed=true`인 경우 훈련용 route fallback에는 쓸 수 있지만, `runtime_route_allowed=true`가 되기 전에는 exact 절차 route로 주장하지 않는다.
- `verify:sid-derived-geometry`는 `IPDAS_4K_YDM_R067_D6_5`가 YDM 기준 true bearing 59도, 6.5NM 위치인지, `IPDAS_4K_CJU_R013_D30`이 CJU 기준 true bearing 005도, 30.0NM 위치 및 7000ft crossing인지, terminal fix register의 `IPDAS`가 CJU R013/D52.3 및 9000ft crossing continuation으로 이어지는지, IPDAS 4K의 turn capture tolerance가 250kt/25deg bank 기준으로 고정되어 있는지, 그리고 훈련용 runtime path가 `D6.5 -> CJU R013/D15.0 -> D30.0 -> IPDAS` 순서인지 검증한다.
- `verify:conventional-sid-runtime-route`는 앱 runtime이 RWY07 IPDAS 출항에서 기존 `YDM -> CJU -> IPDAS` shortcut을 쓰지 않고, derived geometry 기반 pseudo-fix route를 따라 최종 IPDAS까지 progression하는지 검증한다.

### 4.14 `data/authority/rkpc_conventional_radar_sid_exact_linework_audit.json`

conventional/RADAR SID exact runtime route 승인을 막거나 허용하는 linework gate 장부 파일.

| 필드 | 설명 |
|---|---|
| `procedures[].exact_chart_validation_status` | exact chart linework 검증 상태. 검증 전에는 `pending_chart_linework_validation` |
| `procedures[].exact_runtime_route_allowed` | exact runtime route queue 사용 가능 여부. linework 검증 전에는 `false` |
| `procedures[].source_chart` | source PDF, page, chart title, section |
| `procedures[].source_text_evidence[]` | 해당 page에서 확인한 route text evidence |
| `procedures[].required_linework_checks[]` | exact 전환 전에 필요한 chart georeference, published polyline extraction, turn shape cross-check 등 |
| `procedures[].remaining_blockers[]` | exact route 허용을 막는 남은 작업 |

운용 규칙:

- source text와 radial/DME math가 맞아도 chart-drawn linework cross-check가 없으면 exact runtime route로 주장하지 않는다.
- `training_runtime_path_allowed=true`와 `exact_runtime_route_allowed=false`는 동시에 존재할 수 있다. 이 경우 앱은 훈련용 route fallback만 사용할 수 있다.
- `verify:sid-exact-linework-gate`는 `IPDAS_4K` source PDF page 3 text evidence와 exact-runtime blocking gate를 검증한다.

### 4.15 `data/authority/rkpc_sid_page3_vector_extraction_audit.json`

`제주  SID.pdf` page 3에서 PDF vector 후보 linework를 추출한 감사 파일. 이 파일은 chart vector extraction 성공 여부를 증명하지만, 지리좌표 route geometry는 아니다.

| 필드 | 설명 |
|---|---|
| `status` | `pdf_vector_candidates_extracted_v1` |
| `source_pdf` / `page` | 추출한 source PDF와 page 번호 |
| `generated_artifacts` | SVG, text bbox, 후보 GeoJSON 산출물 경로 |
| `source_text_evidence[]` | 같은 page에서 확인한 IPDAS 4K source text evidence |
| `path_inventory.total_svg_path_count` | page SVG 전체 path 수 |
| `path_inventory.stroked_segment_count` | stroke/fill-none path segment 수 |
| `path_inventory.candidate_count` | 필터를 통과한 vector 후보 수 |
| `candidate_filters` | 후보 추출 기준. 현재 `length_pt_min=20`, `map_area_y_max_pt=590` |
| `top_candidates_by_length[]` | 길이 기준 상위 후보의 bbox와 stroke 정보 |
| `ipdas_4k_exact_decision` | 후보 추출 후에도 exact route를 허용하지 않는 결정 |

### 4.16 `data/geometry/rkpc_sid_page3_vector_candidates.json`

SID page 3 PDF vector 후보 linework FeatureCollection.

| 필드 | 설명 |
|---|---|
| `metadata.coordinate_space` | `pdf_svg_page_points`. lon/lat가 아니라 PDF/SVG page point 좌표 |
| `metadata.limitations[]` | georeference와 published route shape cross-check 전까지 exact route 자동화에 쓰지 말라는 제한 |
| `features[].properties.feature_id` | `SID_PAGE3_VECTOR_CANDIDATE_###` |
| `features[].properties.length_pt` | SVG page point 기준 line length |
| `features[].properties.bbox_svg_pt` | SVG page point 기준 bounding box |
| `features[].geometry.coordinates` | raw page point LineString |

운용 규칙:

- 이 후보 파일은 “PDF vector 추출이 됐다”는 증거이지 “IPDAS 4K exact route가 확정됐다”는 증거가 아니다.
- `verify:sid-page3-vector-extraction`은 후보 500개 이상, longest path 800pt 이상, source text evidence, `pdf_svg_page_points` 좌표계, 그리고 `IPDAS_4K.exact_runtime_route_allowed=false` 유지 여부를 검증한다.

## 5. 이번 단계에서 실제로 채울 우선 섹션

이번 1차 추출에서는 아래만 채운다.

- `runways`
- `frequencies`
- `navaids`
- `controller_positions`
- `handoff_points`
- `fixes`
- `sids`
- `stars`
- `approaches`
- `visual_approach_rules`
- `geometry` anchor 초안
- `scenario_templates` 초안

아래는 2차 추출로 미룬다.

- `mva_sectors` polygon 상세
- `hotspots` geometry 상세
- `정석비행장` 절차 전체
- `contingency_scenarios`
