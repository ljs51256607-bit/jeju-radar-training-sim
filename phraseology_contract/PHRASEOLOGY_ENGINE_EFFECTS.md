# Phraseology Engine Effects

작성일: 2026-05-09

## 목적

각 command intent가 simulator engine에 어떤 state 변경을 요청할지 정의한다.

## 원칙

1. effect는 deterministic해야 한다.
2. LLM은 effect를 생성하지 않는다.
3. LLM은 accepted intent와 slots를 받아 readback만 생성한다.
4. effect가 없는 phrase는 aircraft state를 바꾸지 않는다.

## 주요 effect

### `ASSIGN_HEADING`

- assigned heading을 설정한다.
- heading 입력은 magnetic 기준으로 받고, engine 내부는 true heading으로 변환한다.
- 명시된 `left/right`가 있으면 turn direction을 보존한다.
- HDG 지시는 direct/procedure guidance를 취소하고 vector mode로 전환한다.

### `ASSIGN_SPEED`

- controller speed policy를 `target`으로 설정한다.
- `assigned.speed_kt`는 패널 표시/최근 지시값으로 남기되, engine 판단은 `controller_speed_policy`를 우선한다.
- speed command delay 이후 실제 감속/가속을 시작한다.
- global max는 310 kt다.
- 10000 ft / 250 kt hard cap보다 높은 target은 거절하거나 clamp해야 한다.
- published STAR/APP speed cap보다 높은 target은 제한 fix 5 NM 이내에서 `confirm cancel speed restriction?` 대상이다.

### `MINIMUM_SPEED`

- `minimum speed`는 하한선이 아니라 practical minimum으로 최대한 감속하라는 지시다.
- 현재 simulator target은 155 kt다.
- 보통 5000 ft 이하 접근 spacing 상황에서 쓰지만, 5000 ft 미만이라고 자동으로 155 kt floor가 생기지는 않는다.
- ILS 시단 5 NM 안쪽에서는 aircraft-type landing speed profile이 계속 적용될 수 있다.

### `MAINTAIN_SPEED_UNTIL`

- conditional speed restriction을 설정한다.
- `OR GREATER`는 exact speed가 아니라 minimum speed floor로 처리한다.
- 예: `MAINTAIN 220 KNOTS OR GREATER UNTIL PASSING 8000`은 passing 8000 ft 전까지 IAS 220 kt 이상을 유지한다.
- 예: `MAINTAIN 220 KNOTS OR GREATER UNTIL YUMIN`은 YUMIN 도달/통과 전까지 IAS 220 kt 이상을 유지한다.
- release condition이 충족되면 conditional speed restriction을 해제하고, 명시 speed assignment가 없으면 phase default speed로 복귀한다.
- 10000 ft / 250 kt 법규 rule 또는 approach safety rule과 충돌하면 validation layer가 조정/거절해야 한다.

### `MAINTAIN_SPEED_LIMIT`

- `OR LESS`는 exact speed가 아니라 maximum speed ceiling으로 처리한다.
- `OR GREATER`는 exact speed가 아니라 minimum speed floor로 처리한다.
- 예: `SPEED 180 OR LESS`는 IAS 180 kt 이하를 유지한다.
- 예: `SPEED 180 OR GREATER`는 IAS 180 kt 이상을 유지한다.
- 이 제한은 cancel, supersede, resume normal speed, 또는 다른 speed command가 들어오기 전까지 유지된다.
- global max 310 kt, 10000 ft / 250 kt hard cap, published STAR/APP speed cap보다 우선하지 않는다.
- `OR GREATER`는 true floor이고, `MINIMUM_SPEED`와 다른 지시다.

### `RESUME_NORMAL_SPEED`

- controller speed policy(target/minimum/maximum/minimum_practical)만 해제한다.
- published STAR/APP speed restrictions, 10000 ft / 250 kt hard cap은 유지한다.
- arrival entry, IAF, IF, FAF, final, departure climb phase별 default speed table이 필요하다.
- 접근/도착항공기는 resume normal speed로 불필요하게 재가속하지 않는다.

### `ASSIGN_ALTITUDE`

- assigned altitude를 설정한다.
- vertical speed가 명시되어 있지 않으면 performance profile의 climb/descent 기본값을 사용한다.
- 10000 ft 하강 crossing 전에는 speed compliance rule과 충돌하지 않게 예측 감속을 적용해야 한다.

### `DIRECT_TO_FIX`

- route mode를 direct로 설정한다.
- next fix를 지정한다.
- direct token은 scratchpad에 병합할 수 있다.
- STAR/SID/APP procedure state는 취소한다. `DIRECT {fix}`는 절차 안의 fix여도 절차 continuation 지시가 아니다.
- heading vector와 다르게 fix navigation이므로 wind drift를 보정해 해당 fix로 간다.
- `DIRECT {fix} DESCEND TO {altitude} CANCEL LEVEL RESTRICTION`은 direct fix navigation + assigned altitude 지시로 처리하고, 기존 절차 고도 제한은 더 이상 적용하지 않는다.
- 다시 STAR/SID/APP를 태우려면 별도 `DESCEND VIA`, `CLEARED SID`, `CLEARED ILS` 같은 procedure clearance가 필요하다.

### `CLEARED_STAR`, `CLEARED_SID`, `CLEARED_ILS`

- route mode를 procedure로 설정한다.
- active route target과 procedure route queue를 구성한다.
- 현재 direct/procedure target이 절차 route 안에 있는지 확인한다.

### `CLEARED_VISUAL_APPROACH`

- 기본 route mode는 vector로 유지한다.
- APP visual approach marker를 설정하고 scratchpad를 `VIS`로 갱신한다.
- 항공기가 runway final course 근처에 정렬되어 있으면 RWY07 `LIMSO -> RW070`, RWY25 `TOKIN -> RW250` final route를 capture한다.

### `GO_AROUND`, `FLY_MISSED_APPROACH`

- landing/final approach 상태를 중단한다.
- missed approach route를 새 procedure route로 설정한다.
- speed/altitude 기본값은 missed approach profile에서 가져온다.
- scenario coordinator에 departure flow delay event를 발행할 수 있다.

### `HOLD_AT_FIX`

- route mode를 hold로 설정한다.
- hold fix, inbound course, turn direction, leg time, altitude를 hold state에 저장한다.
- fix entry heading에 따라 direct/parallel/teardrop entry를 선택한다.

### `DESCEND_VIA`

- STAR leg constraint following을 활성화한다.
- altitude/speed constraint를 다음 fix별로 읽는다.
- 필요한 vertical rate를 계산하되 max descent profile을 넘지 않는다.
- 기본값은 lateral path, speed restrictions, altitude restrictions를 모두 따른다.
- `cancel_level_restriction.scope=STAR`가 있으면 lateral path와 speed restrictions는 유지하고 published STAR altitude restrictions만 취소한다.
- `target_altitude_ft`가 있으면 그 고도를 assigned target altitude로 둔다.
- published altitude restrictions를 취소해도 MVA, assigned altitude, terrain/safety floor는 취소하지 않는다.

### `CANCEL_LEVEL_RESTRICTION`

- standalone `CANCEL LEVEL RESTRICTION`은 APP/ILS에서 전역 boolean으로 실행하지 않는다.
- `scope=APP_FIX`와 `fix_id`가 있으면 해당 fix의 approach altitude restriction만 취소한다.
- 다른 APP fix 제한, assigned target altitude, final glidepath는 보존한다.
- `scope=APP_ALL`은 confirm-before-execute 대상이다. fix가 빠진 상태에서 APP 전체 고도 제한을 자동 취소하면 안 된다.

### `CANCEL_SPEED_RESTRICTION`

- named fix가 있으면 해당 STAR/APP fix의 published speed restriction만 취소한다.
- fix가 없고 제한 fix 5 NM 이내의 active conflict가 있으면 그 active restricted fix를 대상으로 할 수 있다.
- fix가 없고 active conflict도 없으면 confirm-before-execute 대상이다.
- altitude restrictions, assigned altitude, lateral route는 취소하지 않는다.

### `AFFIRM`

- 직전 pending confirmation을 승인한다.
- speed restriction conflict pending이면 해당 fix speed restriction을 먼저 취소한다.
- 원래 보류된 speed command가 있으면 speed restriction cancellation 이후 적용한다.
- pending confirmation이 없으면 aircraft state를 바꾸지 않는다.

### `NEGATIVE`

- 직전 pending confirmation을 취소한다.
- aircraft state를 바꾸지 않는다.
