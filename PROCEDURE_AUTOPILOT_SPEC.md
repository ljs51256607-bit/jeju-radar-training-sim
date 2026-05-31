# Procedure Route Queue Spec

## Purpose

이 문서는 STAR, SID, ILS 접근을 항공기 기동 모델과 분리해서 다룬다. 현재 단계의 목표는 정밀 선회/감속/강하가 아니라, 지정된 절차의 fix sequence를 좌표 기반으로 순서대로 따라가게 하는 것이다.

## Current Scope

- 적용 활주로 모드: `RWY 07`, `RWY 25+31`
- 대상 절차:
  - RWY 07: RNAV STAR, RNAV SID, ILS RWY 07 simplified final route
  - RWY 25+31: RWY25 RNAV STAR, RWY25 RNAV SID, RWY25 ILS simplified final route, RWY31 RNAV SID
- 절차 데이터 출처: `jeju-radar-ui/public/reference/rkpc_procedures.json`
- 최신성 기준: KOCA eAIP Package `2026-04-30`, AIP AMDT 5/26, currently effective 30 APR 2026
- 항공기 갱신 주기: 실제 레이더 느낌을 위해 3초마다 위치 갱신
- heading 계산: 관제 입력/표시는 자북, 내부 좌표 이동은 true bearing으로 변환해서 처리

## Route Queue Rules

- STAR/SID는 `route_text`를 `-` 단위로 분해해 fix sequence를 만든다.
- SID의 `1 000 ft` 같은 고도 조건 문자열은 route fix로 보지 않는다.
- ILS Z RWY 07은 훈련 화면 기준으로 `YUMIN -> LIMSO -> RW070` 순서로 수행한다.
- ILS Z RWY 25는 훈련 화면 기준으로 `DUKAL -> TOKIN -> RW250` 순서로 수행한다.
- Visual approach clearance는 항공기가 이미 runway final course에 정렬된 경우에만 final segment route를 만든다. RWY07은 `LIMSO -> RW070`, RWY25는 `TOKIN -> RW250`로 threshold까지 capture하며, 조건 밖에서는 vector marker-only로 남긴다.
- RWY25+31 모드에서는 RWY25 STAR/SID와 paired RWY31 SID를 동시에 visible procedure set으로 본다.
- RWY31 SID는 현재 별도 runway mode가 아니라 `procedure.runway = "31"`, `paired_runway_mode = "25+31"`로 저장한다.
- 화면에서는 `RWY31 SID` overlay toggle로 RWY31 SID 선과 해당 procedure fix label을 켜고 끈다. 이 토글은 지도 표시용이며, 공통 exit fix 정의 자체를 바꾸지 않는다.
- procedure turn behavior는 `data/authority/rkpc_procedure_waypoint_turn_register.json`에 보존한다.
- 일반 route waypoint의 AIP coding table `Fly-over -`는 `fly_by`로 둔다.
- HM holding row의 `Fly-over Y`는 active route leg로 넣지 않고, 향후 holding/turn anticipation 구현용 후보로 남긴다.
- 항공기가 direct-to-fix 상태에서 STAR/SID/ILS를 지정하면, 현재 direct target fix가 해당 절차 route 안에 있는지 먼저 확인한다.
- 항공기가 이미 STAR/SID/ILS 절차 수행 중이면, 현재 active target fix를 기준으로 다음 절차 지정 가능 여부를 확인한다.
- active target fix가 절차 route 안에 있으면 해당 fix부터 route queue를 시작한다.
- active target fix가 절차 route 안에 없으면 절차를 임의로 첫 fix부터 시작하지 않고 에러로 막는다.
- active target fix에 이미 거의 도달한 상태이면 다음 route fix부터 시작한다. 단, ILS/APP 시작 fix(`YUMIN`, `DUKAL`)는 고도 crossing 보호 때문에 근접 상태여도 건너뛰지 않는다.
- 항공기는 현재 target fix에 도달하면 다음 fix를 `next_fix`로 올린다.
- 절차 수행 중 active fix 전에는 다음 leg로 미리 선회하지 않는다.
- active fix capture 시 항공기 위치를 해당 fix 좌표로 고정하고, route target을 다음 fix로 advance한다.
- capture 직후 실제 heading은 즉시 스냅하지 않고 `procedure_capture_transition` 상태로 6초, 즉 3초 radar sweep 2회 동안 다음 leg 방향으로 부드럽게 정렬한다.
- 이 transition 동안 항공기 위치는 다음 leg 중심선 위에서만 진행한다. 목적은 fix 전 조기 선회를 막으면서도, fix 통과 후 heading이 순간이동하는 느낌을 줄이는 것이다.
- 이 동작은 관제 훈련 화면에서 fix를 찍지 않고 지나가거나, fix 이후 큰 overshoot가 나는 것을 막기 위한 route-display contract다.
- 마지막 fix에 도달하면 `route_mode`는 `vector`로 돌아간다.

## Control Rules

- STAR/SID/ILS는 control panel 드롭다운이 아니라 data block `CALLSIGN` 더블클릭 menu에서 지정한다.
- `CALLSIGN` 더블클릭 menu는 빠른 명령 팔레트다. `HDG`, `SPD`, `ALT`, `VS`, 절차 버튼, `TEXT`, `CLR`를 같은 작은 menu에서 처리한다.
- menu 입력은 Enter로 적용하고 OK 버튼은 두지 않는다. `ALT` 입력은 직접 입력과 1000 ft 단위 preset dropdown을 같이 지원한다. preset dropdown 선택은 즉시 적용하고, 직접 타이핑은 Enter로 적용한다.
- RKPC 도착 APP 항공기 menu에는 `STAR CXL`, `STAR VIA`, `ILS`를 표시한다.
- `STAR CXL`은 route와 speed restriction은 적용하되 STAR altitude restriction은 적용하지 않는다. 내부 상태는 `vertical_procedure_mode=cancel_level`이다.
- `STAR VIA`는 route와 speed restriction을 준비하고, 별도 cleared altitude가 들어온 뒤에만 STAR altitude restriction 기반 하강을 적용한다. 내부 상태는 `vertical_procedure_mode=des_via`이다.
- `STAR VIA`만 누르고 고도 지시가 없으면 항공기는 절차 고도제한 때문에 임의로 하강하지 않는다.
- `STAR VIA` 상태에서 `ALT`를 입력하면 `descend via STAR to ALT` 허가로 해석한다. 이때 data block assigned altitude는 관제사가 준 cleared altitude로 보존하고, 자동 하강은 그 cleared altitude보다 낮게 내려가지 않는다.
- STAR scratchpad 자동 표기는 procedure name 전체가 아니라 runway family token을 쓴다. RWY07 STAR는 `P`, RWY25 STAR는 `M`이다.
- DES VIA로 STAR를 지정하거나 기존 STAR를 DES VIA로 전환하면 token 뒤에 `VIA`를 붙인다. 예: RWY07 `P VIA`, RWY25 `M VIA`.
- CXL LVL 상태로 STAR를 지정하거나 전환하면 `VIA`를 제거하고 `P` 또는 `M`만 남긴다.
- DEP 항공기 menu에는 `KAM`, `AKP`, `TAM`, `PAN`, `LIM` 출항 fix 버튼만 표시한다.
- DEP 버튼의 화면 표시는 3글자지만 내부 절차 매칭은 각각 `KAMIT`, `AKPON`, `TAMNA`, `PANSI`, `LIMDI`로 수행한다.
- 절차 버튼은 direct-to-fix로 절차 진입 fix를 지정한 뒤 사용한다. 이미 절차 수행 중이면 현재 active target fix를 기준으로 이어서 사용할 수 있다.
- APP `STAR CXL`/`STAR VIA`는 현재 direct target fix가 포함된 현재 runway mode STAR를 자동 매칭한다.
- APP `ILS`는 현재 runway mode에 맞는 ILS route를 고른다. RWY07은 `YUMIN -> LIMSO -> RW070`, RWY25는 `DUKAL -> TOKIN -> RW250`이다.
- 현재 direct target fix가 선택된 ILS route 안에 있으면 해당 fix부터 ILS route를 시작한다.
- APP `ILS`에서 현재 direct target fix가 현재 runway STAR route 안에 있고 그 STAR가 ILS IAF로 이어지면, STAR 남은 구간을 따라 IAF까지 간 뒤 IF -> runway threshold route를 이어서 수행한다.
- 예: `DAKPI` direct 상태에서 `ILS`를 누르면 `DAKPI -> PC628 -> PIMIK -> YUMIN -> LIMSO -> RW070` 순서로 수행한다.
- 예: `DAKPI`에서 `STAR` 수행 중 `ILS`를 누르면 현재 STAR active target fix부터 `YUMIN`까지 이어간 뒤 `LIMSO -> RW070`으로 전환한다.
- 예: RWY25+31 모드에서 `DOKVU` direct 상태에서 `ILS`를 누르면 `DOKVU -> PC682 -> PC683 -> PC684 -> PC685 -> LIDVO -> DUKAL -> TOKIN -> RW250` 순서로 수행한다.
- DEP 출항 fix 버튼은 해당 exit fix로 끝나는 SID를 선택하고, 현재 direct target fix가 그 SID route 안에 있을 때만 수행한다.
- RWY25+31 모드에서 `KAMIT`와 `AKPON`은 RWY25 SID와 RWY31 SID가 같이 쓰는 공통 exit fix다. fix 버튼은 `KAM`, `AKP` 하나씩만 유지한다.
- 같은 exit fix에서 실제 SID route가 갈라질 때는 fix를 나누지 않고 aircraft의 `departure_runway`를 기준으로 `KAMIT 1W/2N`, `AKPON 1W/1N`을 선택한다.
- `TRAFFIC > STREAM`의 DEP WAVE는 RWY25+31 모드에서 `RWY25 DEP WAVE`와 `RWY31 DEP WAVE`로 분리되며, 각 wave는 `departureRunway + exitFix`로 SID를 고른다.
- 절차 지정 시 data block text에는 짧은 모드 토큰을 붙인다.
- 절차 지정 전 direct-to-fix로 들어간 fix token은 지우지 않는다. 관제사는 data block text에서 어느 fix를 기준으로 STAR/SID/ILS를 수행 중인지 계속 볼 수 있어야 한다.
- Direct-to-fix 자체는 좌표 유도만 수행한다. STAR/ILS route, altitude restriction, speed restriction은 `STAR` 또는 `ILS` 절차 버튼을 눌러 `route_mode=procedure`가 된 뒤에만 적용한다.
- 예: `DCT YUMIN`은 YUMIN으로 가라는 지시일 뿐이고, 자동으로 YUMIN 195 kt 또는 ILS profile을 적용하지 않는다.
- 관제사가 입력한 `assigned.heading_true_deg / speed_kt / altitude_ft / vertical_rate_fpm`은 clearance 원본이다. 자동 절차 유도는 이 값을 덮어쓰지 않고 `execution_*` 내부 목표값을 사용한다.
- DCT/STAR/SID/ILS가 필요한 heading, speed, altitude, vertical rate를 계산하더라도 data block의 관제 지시값은 유지한다.
- STAR: `STAR`
- SID: `SID`
- ILS 접근: `ILS`
- 예: `DAK` direct 상태에서 ILS를 지정하면 text는 `DAK ILS`처럼 유지한다.
- HDG 지시를 넣으면 현재 STAR/SID/ILS 또는 direct-to-fix는 취소된다.
- SPD, ALT, VS, TEXT 변경은 절차 추적을 취소하지 않는다.
- Direct-to-fix를 넣으면 진행 중인 STAR/SID/ILS는 취소되고 direct fix가 우선한다.
- 항공기 삭제는 절차 menu 버튼이 아니라 선택 항공기 상태에서 키보드 `Delete`로 수행한다. 입력창이나 menu에 포커스가 있을 때는 삭제하지 않는다.

## ILS Approach Profile V1

- ILS APP 절차 중에는 route 추적과 별도로 approach phase를 내부 상태로 가진다: `initial`, `intermediate`, `final`, `landed`.
- RWY07 crossing altitude 기준:
  - `YUMIN`: 4000 ft
  - `LIMSO`: 2900 ft
  - `RW070`: touchdown/landing 처리
- RWY25 crossing altitude 기준:
  - `DUKAL`: 4000 ft
  - `TOKIN`: 2900 ft
  - `RW250`: touchdown/landing 처리
- IF 이후 final segment에서는 target speed `160 kt`와 3도 근사 glide path altitude를 자동 배정한다.
- `LIMSO`와 `TOKIN`은 ILS final 정대용 FAF로 처리한다.
- `YUMIN -> LIMSO`, `DUKAL -> TOKIN` 전환 중에는 IAF crossing altitude `4000 ft`를 바닥으로 보호한다. IAF를 넘기 전에 LIMSO/TOKIN `2900 ft` 목표가 먼저 먹으면 안 된다.
- 관제사가 ILS 전에 `A040` 같은 ALT를 입력한 경우, 10초 command delay 중 기존 하강률로 IAF crossing altitude를 뚫고 내려가면 안 된다. ALT boundary guard가 assigned altitude를 먼저 보호한다.
- active APP fix를 capture하기 전에는 다음 APP crossing altitude를 후보로 보지 않는다. `YUMIN`이 active target이면 `LIMSO 2900 ft`를 차단하고, `DUKAL`이 active target이면 `TOKIN 2900 ft`를 차단한다.
- FAF capture 전에는 final course로 미리 돌지 않고 현재 FAF를 계속 target으로 둔다.
- FAF capture 순간 항공기 위치를 FAF 좌표로 고정하고, route target을 runway threshold fix로 advance해 final descent를 시작한다.
- FAF capture 직후 heading은 final course로 즉시 스냅하지 않는다. 6초 capture transition 동안 final centerline 위로 진행하면서 실제 heading을 final course로 섞는다.
- final segment에서는 runway threshold 자체만 직접 쫓지 않고, final centerline 위의 lead point를 계속 목표로 잡아 localizer 중심선으로 붙게 한다.
- final segment의 고도 target은 현재 위치에서 runway threshold까지 남은 거리 기준으로 계산한다. 계산된 glide path altitude가 현재 고도보다 높으면 climb target으로 쓰지 않는다.
- final segment에서 guidance status가 `too_high`이고 landing feasibility가 false이면 glideslope capture failure trigger로 missed approach candidate를 만든다. 이 v1 trigger는 기존 missed approach 확률 설정이 0보다 클 때만 평가되며, 발생하면 random draw와 무관하게 missed approach를 강제한다.
- runway threshold fix에 도달하면 `landing_state=landed`로 전환한다. 앱은 touchdown 후 짧게 유지한 뒤 항공기를 화면에서 제거한다.
- Visual approach final capture v1은 위 final segment lead-point guidance와 threshold landing 처리를 재사용한다. 다만 base-to-final 자동 선회, visual traffic pattern, flare/rollout은 이 범위가 아니다.

## Managed STAR/SID/ILS Vertical Constraints V1

- 기준 파일: `data/reference/rkpc_vertical_profiles.json`
- 적용 대상: `route_mode=procedure`인 RKPC STAR/SID/APP 항공기.
- 절차 지정 시 route guidance는 즉시 활성화되지만, vertical mode는 절차 종류별로 다르게 둔다.
- STAR 지정 기본값은 `vertical_procedure_mode=cancel_level`이다. 이 상태에서는 route와 speed restriction은 따르지만 STAR altitude restriction으로 자동 하강하지 않는다.
- 관제사가 control panel에서 `DES VIA`를 누르면 `vertical_procedure_mode=des_via`로 arm만 한다. 별도 ALT 입력이 들어와 `star_via_clearance_altitude_ft`가 생긴 뒤에만 STAR altitude restriction을 수행한다.
- 관제사가 control panel에서 `CXL LVL`을 누르면 `vertical_procedure_mode=cancel_level`로 바뀌고, 현재 고도 기준으로 수직 profile descent를 해제한다.
- ILS/APP 지정 기본값은 `vertical_procedure_mode=approach`이다. 접근 프로파일에서는 항공기가 해당 crossing altitude보다 높을 때만 YUMIN/DUKAL 4000 ft, LIMSO/TOKIN 2900 ft를 descent/capture target으로 잡는다.
- 관제사가 ALT 또는 VS를 직접 넣으면 해당 mode가 `controller`로 바뀌고, 자동 수직 제약은 그 항공기의 수직 지시를 덮어쓰지 않는다.
- `DES VIA`에서 다음 altitude constraint가 10000 ft 아래이고 현재 IAS가 250 kt 초과이면, 먼저 A100/250을 중간 target으로 둔다. 원래 constraint altitude는 `pending_descent_altitude_ft`에 보관하고, IAS가 gate release speed 이하가 되면 다시 복원한다.
- STAR `at_or_above` 제한은 DES VIA에서 floor로 보호한다. 항공기가 이미 제한고도보다 낮으면 자동 상승 target을 만들지 않는다.
- 이때 A100/250은 내부 `execution_altitude_ft / execution_speed_kt`로만 적용한다. 관제사가 준 `assigned.altitude_ft`와 `assigned.speed_kt`는 바꾸지 않는다.
- STAR coding table의 altitude `-`는 이전 `@` altitude maintain을 carry-forward한다. 예: DOTOL 2P는 `BIROM @7000` 이후 PIMIK 전까지 7000 maintain, DOTOL 2M은 `VEKDI @7000` 이후 LIDVO 전까지 7000 maintain으로 본다.
- STAR AIP `@` speed는 managed maintain target이다. 예: `MANBA @220` 이후 `@220` segment에서는 내부 `execution_speed_kt=220`을 잡는다. 단, 관제사가 SPD를 직접 지시한 controller speed mode에서는 관제 SPD가 우선한다.
- 관제사가 특정 fix의 speed restriction을 취소하면 `cancelled_speed_restriction_fixes`에 저장하고, managed profile은 해당 fix의 active speed와 이후 구간으로 carry-forward되는 speed를 다시 적용하지 않는다.
- `at`, `at_or_above`, `window min` 계열 constraint는 자동 상승 지시를 만들지 않는다. 항공기가 제한고도보다 낮으면 관제사가 별도 ALT/VS를 주기 전까지 시뮬레이터가 임의로 올라가지 않는다.
- 단, ILS/APP profile의 IAF/IF/FAF crossing altitude는 항공기가 그 고도보다 높을 때만 final approach setup용 하강 target으로 처리한다.
- `at_or_below`와 `at`은 다음 constraint fix까지 남은 거리로 required vertical rate를 계산한다.
- required descent가 너무 작으면 아직 TOD 전으로 보고 현 고도를 유지한다.
- Composite STAR+ILS 절차는 STAR constraint와 ILS constraint를 함께 매칭한다. 예: `DAKPI` 이후 ILS를 누르면 `YUMIN 4000`, `LIMSO 2900` constraint도 같이 적용된다.

## Managed SID Constraints V1

- 현재 적용 범위는 `rkpc_procedures.json`에 fix/altitude/speed가 명시된 RNAV SID 제약이다.
- RWY07: `RNAV_PANSI_2E`, `RNAV_LIMDI_1E`의 `PC813 9000 ft / 250 kt`, `PC814 at or below 10000 ft`, `PC816 at or above FL150`.
- RWY25: `RNAV_KAMIT_1W`, `RNAV_IPDAS_1W`, `RNAV_AKPON_1W`, `RNAV_TAMNA_3W`의 명시된 PC832/PC833/PC834/IPDAS/PC846/PAPLU/PC845 고도 제약.
- RWY31: `RNAV_KAMIT_2N`, `RNAV_AKPON_1N`의 PC871/PC872/TOREN/OLLEH/KAMIT 고도 cap/floor.
- SID `at`은 climb target으로 사용한다. 단, 항공기가 이미 해당 고도보다 높으면 자동 하강을 만들지 않는다.
- SID `at_or_below`는 다음 fix까지의 climb cap이다. 예: PC871 at or below 5000 ft이면 controller altitude가 더 높아도 내부 execution target은 먼저 5000 ft를 보호한다.
- SID `at_or_above`는 다음 fix까지 만족해야 하는 minimum climb target이다.
- SID `window`는 하한보다 낮으면 하한으로 climb target을 만들고, window 안에서는 상한을 cap으로 보호한다.
- SID procedure target은 `execution_altitude_ft / execution_vertical_rate_fpm / execution_speed_kt`로 적용하며, 관제사가 입력한 `assigned.altitude_ft` 자체를 바꾸지 않는다.
- SID required climb rate는 항공기 performance profile로 제한한다. 일반 상승은 `climb_fpm`, `EXPEDITE CLIMB`는 `expedite_climb_fpm`, `INCREASE RATE OF CLIMB`는 증가 step을 사용하되 `rkpc_vertical_profiles.json`의 max climb cap을 넘지 않는다.
- SID climb 중 내부 speed target까지 가속해야 하면 `climb_acceleration_vertical_penalty_fpm_per_kt_sec`로 climb 여유를 일부 줄인다.
- SID published climb gradient는 `procedure_level_constraints[].climb_gradient_pct`로 저장한다. Planner는 `% * 6076.12 / 100`으로 ft/NM 값을 만들고, planning ground speed 기준 필요한 fpm을 계산한다.
- ATC/obstacle gradient가 fix altitude target보다 더 높은 climb rate를 요구하면 gradient rate를 우선한다. aircraft performance cap으로도 gradient를 만족하지 못하면 `guidance_status.status=unable`, data block profile panel `CG UNABLE`로 표시한다.
- `required_until_altitude_ft`가 있는 obstacle gradient는 해당 고도 capture band 전까지만 active로 본다.

## Known Limits

- AIP text에서 fix/altitude/speed가 확정된 STAR/SID/ILS 제약만 자동 적용한다. STAR altitude carry-forward는 `@` altitude row가 확인된 구간에만 적용한다.
- SID climb gradient는 현재 모델링된 RNAV SID의 절차 단위 constraint에 한해 적용한다. conventional/RADAR SID와 세부 turn/bank row는 아직 자동 route/VNAV 대상이 아니다.
- conventional/RADAR SID는 route 자동화 대상이 아니다. `rkpc_procedure_constraint_register.json`의 `supplemental_unmodeled_procedures`에 남긴 9개 SID는 `automation_status=blocked_pending_row_audit`이어야 하며, `verify:sid-row-audit`가 이 항목들이 런타임 modeled procedure와 섞이지 않는지 검증한다.
- conventional/RADAR SID geometry derivation 요구사항은 `rkpc_conventional_radar_sid_geometry_audit.json`에 별도로 남긴다. `verify:sid-geometry-audit`는 이 9개 SID가 `runtime_route_allowed=false`이고 `blocked_pending_geometry_derivation` 상태인지 검증한다.
- 부분적으로 파생한 conventional/RADAR SID 좌표, continuation, turn capture tolerance, training runtime path는 `rkpc_conventional_radar_sid_derived_geometry.json`에 둔다. 현재 `IPDAS_4K_YDM_R067_D6_5`, `IPDAS_4K_CJU_R013_D30`, `IPDAS_4K_CJU_R013_D30_TO_IPDAS`, `IPDAS_4K.turn_capture_model`, `IPDAS_4K.runtime_path`는 자기편차 `true=magnetic-8`와 default jet performance 기준으로 검증했다. RWY07 IPDAS 출항의 훈련용 runtime은 기존 `YDM -> CJU -> IPDAS` shortcut 대신 이 pseudo-fix path를 사용하지만, exact chart cross-check가 끝나기 전까지 exact route 자동화라고 주장하지 않는다.
- exact chart linework 승인 gate는 `rkpc_conventional_radar_sid_exact_linework_audit.json`에 둔다. 현재 `IPDAS_4K`는 source PDF page 3 text evidence는 검증했지만, chart georeference와 published polyline/turn-shape cross-check가 남아 `exact_runtime_route_allowed=false`다. `verify:sid-exact-linework-gate`가 이 상태를 고정한다.
- `rkpc_sid_page3_vector_extraction_audit.json`와 `rkpc_sid_page3_vector_candidates.json`는 source SID PDF page 3의 vector 후보 624개를 raw SVG page point 좌표로 추출한 결과다. 이는 published linework 후보를 확보했다는 뜻이지, 아직 georeference/turn-shape cross-check가 끝났다는 뜻은 아니다. `verify:sid-page3-vector-extraction`은 후보 추출 상태와 `exact_runtime_route_allowed=false` 유지를 함께 검증한다.
- ILS final에는 FAF capture 이후 localizer lead-point guidance를 적용한다.
- glideslope capture failure는 final profile의 `too_high + landing_feasible=false` 기반 v1 trigger로만 구현한다. Full autopilot mode failure, flare, rollout은 아직 구현하지 않는다.
