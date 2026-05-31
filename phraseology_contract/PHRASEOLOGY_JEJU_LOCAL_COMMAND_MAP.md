# Jeju Local Command Map

작성일: 2026-05-09

## 목적

표준 phraseology intent를 제주 APP 시뮬레이터의 실제 fix/procedure/runway context에 연결한다.

이 문서는 제주 local supplement다. 표준관제용어 출처 우선순위를 대체하지 않는다.

## 확인한 출처

공식 AIP PDF URL은 2026-04-30 package 기준으로 HEAD 200 응답을 확인했다.

| 출처 | 확인 내용 |
|---|---|
| KOCA eAIP `2026-04-30` RKPC STAR PDF | `제주 STAR.pdf`와 route register의 기준 |
| KOCA eAIP `2026-04-30` RKPC SID PDF | `제주 SID.pdf`와 SID route 기준 |
| KOCA eAIP `2026-04-30` RKPC INSTR APCH CHART PDF | ILS/RNP/VOR approach fix와 missed approach 기준 |
| KOCA eAIP `2026-04-30` RKPC-TEXT PDF | 공항 text 기준 |
| `data/reference/rkpc_procedures.json` | 앱이 읽는 절차 기준 JSON |
| `data/authority/rkpc_scenario_fix_role_register.json` | arrival entry / departure exit 역할 기준 |
| `data/reference/rkpc_transfer_rules.json` | ACC-APP/DC 이양 fix와 기본 고도 기준 |
| `<private-local-notes-redacted>` | DOTOL/UPGOS 흐름, runway별 sequencing 감각 |

## Arrival Entry Map

| Fix | Role | RWY07 STAR | RWY25 STAR | 비고 |
|---|---|---|---|---|
| `DOTOL` | RNAV STAR entry | `RNAV_DOTOL_2P` | `RNAV_DOTOL_2M` | Y711, 기본 FL160 |
| `UPGOS` | RNAV STAR entry | `RNAV_UPGOS_1P` | `RNAV_UPGOS_2M` | Y572, 기본 FL160 |
| `TAMNA` | RNAV STAR entry / SID exit | `RNAV_TAMNA_2P` | `RNAV_TAMNA_2M` | A595/Y677, 기본 FL150 |
| `TOSAN` | RNAV STAR entry | `RNAV_TOSAN_2P` | `RNAV_TOSAN_2M` | Y572/A586, 기본 FL150 |
| `SOSDO` | RNAV STAR entry | `RNAV_SOSDO_2P` | `RNAV_SOSDO_2M` | Y722, 기본 FL150 |
| `LIMDI` | RNAV STAR entry / SID exit | `RNAV_LIMDI_1P` | `RNAV_LIMDI_2M` | Y677, 기본 FL150, offset note 있음 |
| `IPDAS` | conventional gate | 없음 | 없음 | B576, 입항 기본 12000 ft |
| `MAKET` | conventional gate | 없음 | 없음 | A586, 입항 기본 10000 ft |

## Approach Map

| Runway | Procedure | IAF/Initial | FAF/Final | Sim simplified route | Missed approach anchor |
|---|---|---|---|---|---|
| `07` | `ILS_Z_LOC_Z_RWY_07` | `YUMIN` | `LIMSO` | `YUMIN -> LIMSO -> RW070` | `PC404 -> PETAA`, hold 8000 ft |
| `07` | `RNP_Z_RWY_07` / `RNP_Y_RWY_07` | `YUMIN` | `LIMSO`, `TEWOO` | `YUMIN -> LIMSO -> TEWOO -> RW070` | `PC404 -> PETAA` |
| `25` | `ILS_Z_LOC_Z_RWY_25` | `DUKAL` | `TOKIN` | `DUKAL -> TOKIN -> RW250` | `PC403 -> LOTKA`, hold 6000 ft |
| `25` | `RNP_Z_RWY_25` / `RNP_Y_RWY_25` | `DUKAL` | `TOKIN` | `DUKAL -> TOKIN -> RW250` | `PC403 -> LOTKA` |

### Approach Reconciliation Note

RWY25 `ILS_Y_LOC_Y_RWY_25`는 command map에 넣기 전 reconciliation이 필요하다.

- 현재 `data/reference/rkpc_procedures.json`에는 `D10.8 YDM / D5.7 YDM / D1.5 YDM` 계열로 들어가 있다.
- 로컬 APCH PDF-derived text 기준으로는 `D10.5 ICHE / D5.3 ICHE / D1.0 ICHE` 계열일 가능성이 있다.
- 따라서 v0 local command map은 RWY25 ILS Z의 `DUKAL -> TOKIN -> RW250` simplified route만 확정적으로 사용한다.

## Departure Exit Map

| Exit fix | RWY07 | RWY25 | RWY31 in `25+31` mode | 비고 |
|---|---|---|---|---|
| `KAMIT` | `RNAV_KAMIT_2E` | `RNAV_KAMIT_1W` | `RNAV_KAMIT_2N` | RWY31은 paired runway mode |
| `AKPON` | `RNAV_AKPON_1E` | `RNAV_AKPON_1W` | `RNAV_AKPON_1N` | RWY31은 paired runway mode |
| `TAMNA` | `RNAV_TAMNA_2E` | `RNAV_TAMNA_3W` | 없음 | conventional `TAMNA_2K`도 register에 존재 |
| `PANSI` | `RNAV_PANSI_2E` | `RNAV_PANSI_2W` | 없음 | Y711 이양 anchor |
| `LIMDI` | `RNAV_LIMDI_1E` | `RNAV_LIMDI_1W` | 없음 | RWY25 이양 13000 ft variant 있음 |
| `IPDAS` | `IPDAS_4K` | `RNAV_IPDAS_1W` / `IPDAS_1L` | 없음 | conventional overlap gate |
| `MAKET` | `MAKET_4K` | 없음 | 없음 | conventional gate |

## Local Command Examples

### Arrival / STAR

```text
JJA123 DOTOL STAR
JJA123 UPGOS ARRIVAL
JJA123 CLEARED DOTOL TWO PAPA ARRIVAL
JJA123 CLEARED LIMDI TWO MIKE ARRIVAL
JJA123 DIRECT YUMIN
JJA123 CLEARED ILS RUNWAY 07
JJA123 CLEARED ILS Z RUNWAY 07 APPROACH
```

Mapping:

- `DOTOL STAR` in RWY07 mode -> `CLEARED_STAR`, procedure `RNAV_DOTOL_2P`
- `DOTOL STAR` in RWY25 mode -> `CLEARED_STAR`, procedure `RNAV_DOTOL_2M`
- `DIRECT YUMIN` -> `DIRECT_TO_FIX`, fix `YUMIN`
- `CLEARED ILS RUNWAY 07` -> `CLEARED_ILS`, simplified route `YUMIN -> LIMSO -> RW070`
- `CLEARED VISUAL APPROACH RUNWAY 07` -> `CLEARED_VISUAL_APPROACH`, visual marker `VIS`

### Departure / SID

```text
KAL481 KAMIT SID
KAL481 AKPON DEPARTURE
KAL481 CLEARED KAMIT TWO ECHO DEPARTURE
KAL481 CLEARED IPDAS ONE WHISKEY DEPARTURE
KAL481 DIRECT KAMIT
```

Mapping:

- `KAMIT SID`, departure runway `07` -> `RNAV_KAMIT_2E`
- `KAMIT SID`, departure runway `25` -> `RNAV_KAMIT_1W`
- `KAMIT SID`, departure runway `31` -> `RNAV_KAMIT_2N`

### Missed / Go-around

```text
JJA123 GO AROUND
JJA123 FLY MISSED APPROACH
JJA123 HOLD AT PETAA
JJA123 HOLD AT LOTKA
```

Mapping:

- RWY07 ILS/RNP missed anchor -> `PC404 -> PETAA`
- RWY25 ILS/RNP missed anchor -> `PC403 -> LOTKA`

### Transfer / Local Flow

```text
JJA123 MAINTAIN FL160 UNTIL DOTOL
JJA123 MAINTAIN FL150 UNTIL LIMDI
JJA123 MAINTAIN 220 KNOTS OR GREATER UNTIL PASSING 10000
JJA123 MAINTAIN 210 KNOTS OR GREATER UNTIL YUMIN
JJA123 OFFSET 3NM RIGHT OF TRACK
JJA123 DESCEND VIA DOTOL TWO PAPA ARRIVAL TO {assigned altitude} CANCEL LEVEL RESTRICTION
```

Mapping:

- `MAINTAIN FL160 UNTIL DOTOL` -> future transfer constraint intent 후보
- `MAINTAIN FL150 UNTIL LIMDI` -> future transfer constraint intent 후보
- `MINIMUM SPEED` -> 접근 sequence spacing용 practical minimum 감속 지시. 현재 simulator target은 155 kt이며 `OR GREATER` floor가 아니다.
- `MAINTAIN {speed} KNOTS OR GREATER UNTIL PASSING {altitude}` -> passing altitude 전까지 minimum speed floor 유지
- `MAINTAIN {speed} KNOTS OR GREATER UNTIL {fix}` -> fix 도달/통과 전까지 minimum speed floor 유지
- `OFFSET 3NM RIGHT OF TRACK` -> LIMDI transfer 특수조건이며 별도 intent 후보
- `DESCEND VIA ... TO {assigned altitude} CANCEL LEVEL RESTRICTION` -> STAR lateral path와 speed restrictions는 유지하고 STAR altitude restrictions만 취소한다. `{assigned altitude}`는 4000 ft로 고정된 값이 아니라 관제사가 준 임의의 cleared/assigned altitude다.
- `CANCEL YUMIN LEVEL RESTRICTION` 또는 `CANCEL LEVEL RESTRICTION AT YUMIN` -> APP/ILS에서는 YUMIN altitude restriction만 취소한다. LIMSO/IF, final glidepath, assigned target altitude는 유지한다.
- fix 없이 `CANCEL LEVEL RESTRICTION`만 입력되면 APP 전체 취소로 자동 실행하지 않고 확인 대상으로 둔다.

## Tacit Flow Notes

로컬 tacit note는 command grammar가 아니라 sequencing/debrief 보조 근거로만 사용한다.

- RWY07에서는 DOTOL 계열 유입이 연속될 때 UPGOS 계열은 겉보기 거리와 무관하게 후순위가 되기 쉽다.
- RWY25에서는 DOTOL/UPGOS 흐름의 wind effect가 actual speed 차이를 만들 수 있다.
- APP의 목표는 빠른 handoff가 아니라 ARR/TWR가 받을 수 있는 usable handoff다.
