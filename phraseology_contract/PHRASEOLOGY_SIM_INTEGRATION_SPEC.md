# Phraseology Sim Integration Spec

작성일: 2026-05-09

## 목적

phraseology parser가 만든 intent JSON을 현재 제주 radar simulator engine에 어떻게 연결할지 정의한다.

이 문서는 실제 `src` 코드를 수정하지 않는다. 옆 스레드의 sim 구현자가 볼 수 있는 연결 계약이다.

## Integration Flow

```text
raw ATC phrase
  -> parse-atc-command
  -> command intent JSON
  -> validate aircraft/callsign/fix/procedure
  -> apply engine effect
  -> aircraft motion/procedure engine
```

## Existing Engine Candidate

현재 앱에는 유사한 기능이 이미 있다.

| Intent | 현재 연결 후보 | 비고 |
|---|---|---|
| `ASSIGN_HEADING` | aircraft assigned heading / HDG command | left/right turn direction은 추가 필요 |
| `ASSIGN_SPEED` | controller speed policy target / SPD command | IAS 기준, global max 310 kt |
| `MAINTAIN_SPEED_LIMIT` | controller speed policy maximum/minimum | `or less` ceiling, `or greater` floor |
| `MAINTAIN_SPEED_UNTIL` | controller minimum speed policy with release condition | passing altitude/fix에서 자동 release |
| `RESUME_NORMAL_SPEED` | clear controller speed policy | hard cap/published/default min은 유지 |
| `CANCEL_SPEED_RESTRICTION` | cancel named/active fix published speed restriction | altitude restriction은 유지 |
| `AFFIRM` | execute pending confirmation | callsign 없이도 직전 pending confirm에 적용 |
| `NEGATIVE` | clear pending confirmation | aircraft state change 없음 |
| `ASSIGN_ALTITUDE` | aircraft assigned altitude / ALT command | 10000 ft crossing speed rule 추가 필요 |
| `ASSIGN_VERTICAL_SPEED` | aircraft assigned vertical rate / VS command | explicit controller VS |
| `RESUME_NORMAL_CLIMB` | managed climb profile default | `NORMAL CLIMB` alias 포함 |
| `RESUME_NORMAL_DESCENT` | managed descent profile default | `NORMAL DESCENT` alias 포함 |
| `EXPEDITE_DESCENT` | managed descent energy mode | 하강 목표/active descent 필요 |
| `EXPEDITE_CLIMB` | managed climb energy mode | 상승 목표/active climb 필요 |
| `INCREASE_DESCENT_RATE` | managed descent energy mode step-up | 하강 목표/active descent 필요 |
| `INCREASE_CLIMB_RATE` | managed climb energy mode step-up | 상승 목표/active climb 필요 |
| `DIRECT_TO_FIX` | direct-to-fix route mode | STAR/SID/APP continuation 아님. fix 유효성 검증 필요 |
| `CLEARED_STAR` | procedure route queue STAR | active target 기준 검증 필요 |
| `CLEARED_SID` | procedure route queue SID | departure_runway + exit_fix 기준 |
| `CLEARED_ILS` | procedure route queue APP | RWY07 YUMIN/LIMSO, RWY25 DUKAL/TOKIN |
| `CLEARED_VISUAL_APPROACH` | visual approach marker/final capture APP | 기본은 vector marker-only, final course 정렬 시 `VIS` scratchpad와 runway threshold final route 설정 |

## Future Engine Work

| Intent | 필요한 engine work |
|---|---|
| `GO_AROUND` | final/landing state 중단 + missed approach profile |
| `FLY_MISSED_APPROACH` | published missed approach route queue |
| `HOLD_AT_FIX` | hold state, entry algorithm, leg timer |
| `DESCEND_VIA` | STAR altitude/speed constraints following |

`DESCEND_VIA` 세부 semantics:

- 기본 `DESCEND VIA`는 STAR lateral path, speed restrictions, altitude restrictions를 모두 따른다.
- `CANCEL LEVEL RESTRICTION` modifier가 `DESCEND VIA`에 붙으면 `cancel_level_restriction.scope=STAR`로 해석한다. STAR lateral path와 speed restrictions는 유지하고, STAR altitude restrictions만 취소한다.
- `TO {altitude}`가 있으면 그 값을 assigned target altitude로 설정한다.
- MVA, assigned target altitude, terrain/safety floor는 항상 유지한다.

`DIRECT_TO_FIX` 세부 semantics:

- `DIRECT {fix}`는 fix를 이용한 track navigation이다. heading vector와 달리 wind drift를 보정해 해당 fix로 간다.
- 대상 fix가 STAR/SID/APP 안에 있더라도 절차 continuation으로 해석하지 않는다.
- 기존 STAR/SID/APP procedure state, approach phase, procedure capture transition은 취소한다.
- `DIRECT {fix} DESCEND TO {altitude} CANCEL LEVEL RESTRICTION`은 direct fix navigation + assigned altitude 지시이며, 이전 절차 고도 제한은 더 이상 적용하지 않는다.
- 다시 STAR/SID/APP를 타려면 `DESCEND VIA`, `CLEARED SID`, `CLEARED ILS` 같은 새 procedure clearance가 필요하다.

APP/ILS standalone level restriction cancel:

- `CANCEL {fix_id} LEVEL RESTRICTION` -> `scope=APP_FIX`, 해당 fix altitude restriction만 취소한다.
- `CANCEL LEVEL RESTRICTION AT {fix_id}` -> `scope=APP_FIX`, 해당 fix altitude restriction만 취소한다.
- `CANCEL LEVEL RESTRICTION`처럼 fix가 없으면 `scope=APP_ALL`, `requires_confirmation=true`로만 전달한다. engine adapter는 확인 없이 실행하면 안 된다.
- APP fix cancel은 다른 APP fix, assigned target altitude, final glidepath를 취소하지 않는다.

Speed policy integration:

- `ASSIGN_SPEED` -> `controller_speed_policy={ type: "target", speed_kt }`
- `SPEED {speed} OR LESS` -> `controller_speed_policy={ type: "maximum", speed_kt }`
- `SPEED {speed} OR GREATER` -> `controller_speed_policy={ type: "minimum", speed_kt }`
- `MINIMUM SPEED` -> `controller_speed_policy={ type: "minimum_practical", speed_kt: 155 }`
- `MAINTAIN {speed} OR GREATER UNTIL PASSING {altitude/fix}` -> `controller_speed_policy={ type: "minimum", speed_kt, release_condition }`
- `RESUME NORMAL SPEED` -> controller speed policy만 해제한다. published STAR/APP speed restrictions, 10000 ft / 250 kt는 유지한다.
- `CANCEL {fix} SPEED RESTRICTION` -> active procedure route 안의 해당 fix speed cap만 취소한다.
- `CANCEL SPEED RESTRICTION` -> 5 NM 이내 active speed cap conflict가 있으면 그 fix를 대상으로 할 수 있고, 없으면 confirm한다.
- `AFFIRM` -> 직전 pending confirmation을 승인한다. speed restriction conflict라면 pending fix speed restriction을 취소하고 보류된 원래 speed command를 적용한다.
- `NEGATIVE` -> 직전 pending confirmation을 취소하고 aircraft state를 바꾸지 않는다.

Speed validation:

- simulator global max speed는 310 kt다.
- 도착/접근항공기는 10000 ft 이하에서 250 kt 초과 target/floor를 받으면 unable이다.
- `MINIMUM SPEED`의 155 kt는 자동 floor가 아니라 practical deceleration target이다.
- controller target/floor가 published STAR/APP speed cap보다 높고 제한 fix 5 NM 이내면 `confirm cancel speed restriction?`을 먼저 낸다.

## Effect Application Rule

LLM은 아래 필드를 직접 수정하지 않는다.

- `latitude`
- `longitude`
- `altitude_ft`
- `ground_speed_kt`
- `indicated_speed_kt`
- `heading_true_deg`
- `route_mode`
- `procedure_route`

LLM/parser는 아래 command request만 만든다.

```json
{
  "callsign": "JJA123",
  "intent": "ASSIGN_SPEED",
  "slots": {
    "speed_kt": 210,
    "speed_policy": {
      "type": "target",
      "speed_kt": 210
    }
  }
}
```

engine adapter가 이것을 현재 aircraft state에 적용한다.

```json
{
  "assigned": {
    "speed_kt": 210
  },
  "controller_speed_policy": {
    "type": "target",
    "speed_kt": 210
  },
  "speed_control_mode": "controller",
  "speed_active_at_ms": "now + command_delay"
}
```

## Validation Layer

실제 연결 전 최소 검증:

1. callsign이 현재 traffic에 존재하는가
2. intent가 aircraft phase에 적용 가능한가
3. fix/procedure/runway가 현재 dataset에 존재하는가
4. runway mode와 procedure가 충돌하지 않는가
5. 10000 ft / 250 kt rule 같은 법규 rule과 충돌하지 않는가
6. accepted command만 engine effect로 넘기는가
