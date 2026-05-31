# Scenario Stream Spec

## 목적

이 문서는 사용자가 설정하는 입항 stream과 출항 wave의 동작 기준을 고정한다.

## 현재 구현 범위

현재 구현은 `RWY 07` 단일 출항 wave와 `RWY 25+31` 이중 출항 wave를 지원한다.

## Stream preset export/import

`TRAFFIC > STREAM FLOW`의 preset은 항공기 state를 저장하지 않고, ARR STREAM/DEP WAVE 입력 form만 저장한다.

- local preset은 브라우저 `localStorage`에 최대 24개 저장한다.
- `EXPORT`는 선택한 stream preset을 `jeju_radar_stream_preset_export_v1` wrapper JSON으로 내보낸다.
- export summary에는 preset name, runway, savedAt, arrival fix, departure07/25/31 exit fix가 포함된다.
- `IMPORT`는 export wrapper 또는 raw v1 stream preset JSON을 받아 새 local preset으로 저장한다.
- import 시 preset id와 savedAt은 현재 시점 기준으로 새로 부여한다.
- RWY가 다른 preset은 load를 막고, 먼저 해당 runway mode로 전환하라는 오류를 낸다.

### 입항 stream

사용자가 설정하는 값:

- entry fix
- 항공기 간격 NM
- add 대수
- keep buffer 대수
- 초기 고도
- 초기 속도
- 기종
- callsign prefix 또는 `AUTO`

동작:

1. `ADD ARR`를 누르면 선택한 entry fix 바깥쪽에 설정한 add 대수만큼 항공기를 추가한다.
2. 같은 entry fix에 다시 `ADD ARR`를 누르면 기존 항공기를 지우지 않고 가장 바깥 항공기 뒤쪽에 추가한다.
3. 바깥쪽 방향은 `rkpc_transfer_rules`의 arrival transfer airway와 `ats_routes`의 실제 항로 leg를 기준으로 계산한다.
4. 선택한 entry fix에 맞는 STAR가 있으면 생성 즉시 STAR route queue를 부여한다.
5. STAR가 없는 `IPDAS`, `MAKET` 같은 conventional gate는 direct-to-gate traffic으로 생성한다.
6. 초기 속도 입력이 `AUTO` 또는 공란이면 `data/reference/rkpc_flight_profiles.json`의 entry speed range에 따라 `280~300 kt` 랜덤으로 생성한다.
7. `AUTO KEEP`을 누르면 entry fix 바깥쪽 pre-entry buffer를 계속 감시한다.
8. pre-entry buffer는 아직 active target이 entry fix인 항공기만 센다. 이미 entry fix를 지나 STAR 내부로 들어간 항공기는 buffer에서 제외한다.
9. pre-entry buffer가 keep buffer 대수보다 줄면 가장 바깥 항공기 뒤쪽에 설정 NM 간격으로 새 항공기를 보충한다.
10. `CLR ARR`는 자동 보충 stream만 중지한다. 이미 생성된 항공기는 유지한다.
10. `DEL ARR`는 자동 보충 stream을 중지하고 `arrival_stream`으로 생성된 항공기를 모두 제거한다.

Route progression 검증:

- `verify:scenario-stream-route-progression`은 DOTOL arrival stream으로 여러 항공기를 동시에 생성한 뒤, 각 항공기가 독립적인 STAR route queue를 유지하는지 확인한다.
- 각 항공기는 spacing 때문에 서로 다른 tick에 STAR를 완료해야 하며, 한 항공기의 `procedure_route_index` 진행이 다른 항공기의 route state를 오염시키면 실패한다.
- 검증은 생성 직후 route array 독립성, next-fix 순서, route index monotonicity, STAR 완료 후 vector 복귀와 scratchpad procedure token clear까지 확인한다.

Arrival stream airway 기준:

- `DOTOL`: `Y711`
- `UPGOS`: `Y572`
- `TAMNA`: `A595/Y677`
- `TOSAN`: `Y572/A586`
- `SOSDO`: `Y722`
- `LIMDI`: `Y677`
- `IPDAS`: `B576`
- `MAKET`: `A586`

예:

- `DOTOL / 12NM / ADD 4`를 누르면 DOTOL 바깥쪽에 4대가 추가된다.
- 같은 설정으로 다시 `ADD ARR`를 누르면 기존 4대 뒤쪽에 4대가 더 붙어서 총 8대 흐름이 된다.
- `DOTOL / 12NM / KEEP 4`에서 `AUTO KEEP`을 누르면 DOTOL 바깥쪽 pre-entry 항공기를 최소 4대로 유지한다.
- `CLR ARR`를 누르면 더 이상 보충하지 않지만 화면의 항공기는 남는다.
- `DEL ARR`를 누르면 입항 stream으로 만든 항공기를 화면에서 제거한다.
- `CALL=AUTO`이면 생성 항공기마다 한국 항공사 3-letter prefix와 3~4자리 숫자를 랜덤 배정한다.
- `CALL=JJA`, `CALL=KAL`처럼 직접 prefix를 넣으면 해당 prefix로 순번 콜사인을 만든다.

### 출항 wave

사용자가 설정하는 값:

- departure runway
- exit fix
- 이륙 간격 분
- 생성 대수
- 초기 상승률
- 기종
- callsign prefix 또는 `AUTO`
- 목적지 공항

동작:

1. RWY 07 모드에서는 `DEP WAVE` 하나만 표시하고 departure runway는 `07`로 고정한다.
2. RWY 25+31 모드에서는 `RWY25 DEP WAVE`와 `RWY31 DEP WAVE`를 따로 표시한다.
3. 각 wave는 exit fix, 이륙 간격, 생성 대수, 상승률, 기종, callsign, destination을 독립적으로 가진다.
4. 첫 항공기는 wave 시작 시 즉시 생성한다.
5. 이후 항공기는 설정한 분 간격마다 해당 departure runway threshold에서 생성한다.
6. 생성 위치는 `departureRunway`의 runway threshold다.
7. 생성 직후에는 현재고도 `A000`, 현재속도 `0 kt` 상태로 runway takeoff roll을 시작한다.
8. departure end / 반대편 runway threshold 도달 시 `A010`, 최소 `180 kt`로 SID guidance를 시작한다.
9. 지시고도 `A100`, 지시속도 `250 kt`로 시작한다.
10. SID는 `selectedRunway`가 아니라 `departureRunway + exitFix` 조합으로 선택한다.
11. 예: `departureRunway=25, exitFix=KAMIT`은 RWY25 KAMIT SID를 사용하고, `departureRunway=31, exitFix=KAMIT`은 RWY31 KAMIT SID를 사용한다.
12. `IPDAS`, `MAKET`처럼 현재 절차 JSON에 RNAV SID가 없거나 conventional gate인 경우에는 해당 departure runway에서 허용될 때 fallback route를 사용한다.
13. 10000 ft 이하에서는 자동 target speed `250 kt`를 유지한다.
14. 10000 ft 초과 후 별도 SPD 지시가 없으면 자동 target speed를 `300 kt`로 바꾼다.
15. `CALL=AUTO`이면 생성 항공기마다 한국 항공사 3-letter prefix와 3~4자리 숫자를 랜덤 배정한다.
16. `CALL=KAL`처럼 직접 prefix를 넣으면 해당 prefix로 순번 콜사인을 만든다.
17. `CLR 25`, `CLR 31`은 해당 runway의 남은 departure wave 타이머만 중지한다. 이미 생성된 항공기는 유지한다.
18. `DEL 25`, `DEL 31`은 해당 runway의 departure wave 타이머를 중지하고 그 runway의 `departure_wave` 항공기를 제거한다.

## 개별 DEP 생성

`TRAFFIC > FIX STAR`에서 `POS=DEP`로 항공기 한 대를 직접 만들 때도 departure wave와 같은 SID 선택 규칙을 쓴다.

1. RWY 07 모드에서는 `RWY=07`만 선택된다.
2. RWY 25+31 모드에서는 `RWY=25`, `RWY=31`을 선택할 수 있다.
3. `EXIT` 목록은 선택한 `RWY`의 scenario departure fix role에서 가져온다.
4. 예: `RWY=25`는 RWY25 출항 FIX 목록을 표시하고, `RWY=31`은 RWY31 출항 FIX 목록만 표시한다.
5. 생성된 항공기는 `departure_runway`를 가지고, SID는 `departureRunway + exitFix` 조합으로 선택한다.

## Pause 동작

Pause 중에는 radar position update와 departure wave timer가 모두 멈춘다.

입항 stream 보충 timer도 Pause 중에는 멈춘다.

## 현재 한계

- TMA boundary crossing 시점에 STAR를 부여하는 방식이 아니라, 생성 즉시 STAR route queue를 부여한다.
- 출항 takeoff roll은 radar-level 단순 모델이다. 실제 활주로 가속거리, rotation speed, flap/weight 성능은 아직 반영하지 않는다.
- conventional SID의 radial/DME/arc geometry는 아직 정밀 자동비행하지 않는다.
- wind, runway occupancy, departure release, APP/DEP coordination은 아직 없다.
