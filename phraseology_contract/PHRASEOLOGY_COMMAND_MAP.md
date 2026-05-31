# Phraseology Command Map

작성일: 2026-05-09

## 목적

관제 phrase를 simulator intent와 engine effect로 연결한다.

이 문서는 LLM 프롬프트가 아니라 simulator contract다.

## 기본 흐름

```text
raw phrase
  -> grammar pattern match
  -> slot extraction
  -> command intent
  -> engine effect
  -> pilot readback template
```

## v0 Command Map

| Phrase family | Intent | Engine command | 구현 상태 |
|---|---|---|---|
| `HEADING {hdg}` | `ASSIGN_HEADING` | `set_assigned_heading` | existing_engine_candidate |
| `TURN LEFT/RIGHT HEADING {hdg}` | `ASSIGN_HEADING` | `set_assigned_heading_with_turn_direction` | contract_ready |
| `SPEED {speed}` | `ASSIGN_SPEED` | `set_assigned_speed` | existing_engine_candidate |
| `REDUCE SPEED {speed}` | `ASSIGN_SPEED` | `set_assigned_speed` | existing_engine_candidate |
| `MAINTAIN {speed} KNOTS` | `ASSIGN_SPEED` | `set_assigned_speed` | existing_engine_candidate |
| `SPEED {speed} OR LESS` | `MAINTAIN_SPEED_LIMIT` | `set_maximum_speed_ceiling` | existing_engine_candidate |
| `MAINTAIN {speed} OR GREATER` | `MAINTAIN_SPEED_LIMIT` | `set_minimum_speed_floor` | existing_engine_candidate |
| `MINIMUM SPEED` | `MINIMUM_SPEED` | `set_minimum_practical_speed_155` | existing_engine_candidate |
| `MAINTAIN {speed} KNOTS OR GREATER UNTIL PASSING {altitude}` | `MAINTAIN_SPEED_UNTIL` | `set_conditional_minimum_speed_until_altitude_crossing` | existing_engine_candidate |
| `MAINTAIN {speed} KNOTS OR GREATER UNTIL {fix}` | `MAINTAIN_SPEED_UNTIL` | `set_conditional_minimum_speed_until_fix` | existing_engine_candidate |
| `RESUME NORMAL SPEED` | `RESUME_NORMAL_SPEED` | `clear_controller_speed_policy` | existing_engine_candidate |
| `CLIMB {altitude}` | `ASSIGN_ALTITUDE` | `set_assigned_altitude` | existing_engine_candidate |
| `DESCEND {altitude}` | `ASSIGN_ALTITUDE` | `set_assigned_altitude` | existing_engine_candidate |
| `MAINTAIN {altitude}` | `ASSIGN_ALTITUDE` | `set_assigned_altitude` | existing_engine_candidate |
| `CLIMB VIA` | `RESUME_NORMAL_CLIMB` | `resume_managed_climb_profile` | future_contract |
| `RESUME NORMAL CLIMB` / `NORMAL CLIMB` | `RESUME_NORMAL_CLIMB` | `resume_managed_climb_profile` | implemented |
| `RESUME NORMAL DESCENT` / `NORMAL DESCENT` | `RESUME_NORMAL_DESCENT` | `resume_managed_descent_profile` | implemented |
| `EXPEDITE CLIMB` | `EXPEDITE_CLIMB` | `set_expedite_climb_energy_mode` | implemented |
| `EXPEDITE DESCENT` | `EXPEDITE_DESCENT` | `set_expedite_descent_energy_mode` | implemented |
| `INCREASE RATE OF CLIMB` | `INCREASE_CLIMB_RATE` | `set_increase_climb_rate_energy_mode` | implemented |
| `INCREASE RATE OF DESCENT` | `INCREASE_DESCENT_RATE` | `set_increase_descent_rate_energy_mode` | implemented |
| `DIRECT {fix}` | `DIRECT_TO_FIX` | `route_mode_direct` | existing_engine_candidate |
| `DIRECT {fix} DESCEND TO {altitude} CANCEL LEVEL RESTRICTION` | `DIRECT_TO_FIX` | `route_mode_direct + set_assigned_altitude + cancel_previous_procedure_restrictions` | accepted_local_usage |
| `CLEARED STAR` | `CLEARED_STAR` | `route_mode_procedure_star` | existing_engine_candidate |
| `CLEARED SID` | `CLEARED_SID` | `route_mode_procedure_sid` | existing_engine_candidate |
| `CLEARED ILS` | `CLEARED_ILS` | `route_mode_procedure_app` | existing_engine_candidate |
| `CLEARED ILS Z RWY {runway}` | `CLEARED_ILS` | `route_mode_procedure_app` | accepted_alias |
| `CLEARED VISUAL APPROACH RUNWAY {runway}` | `CLEARED_VISUAL_APPROACH` | `visual_marker_or_final_capture_app` | implemented |
| `CLEARED VISUAL RWY {runway}` | `CLEARED_VISUAL_APPROACH` | `visual_marker_or_final_capture_app` | accepted_alias |
| `GO AROUND` | `GO_AROUND` | `start_missed_approach` | future_contract |
| `FLY MISSED APPROACH` | `FLY_MISSED_APPROACH` | `start_missed_approach` | future_contract |
| `HOLD AT {fix}` | `HOLD_AT_FIX` | `route_mode_hold` | future_contract |
| `DESCEND VIA {procedure}` | `DESCEND_VIA` | `enable_procedure_constraints` | future_contract |
| `DESCEND VIA {procedure} TO {altitude} CANCEL LEVEL RESTRICTION` | `DESCEND_VIA` | `follow_lateral_and_speed_cancel_star_altitude_constraints` | future_contract |
| `CANCEL {fix} LEVEL RESTRICTION` | `CANCEL_LEVEL_RESTRICTION` | `cancel_named_app_fix_altitude_constraint` | future_contract |
| `CANCEL {fix} SPEED RESTRICTION` | `CANCEL_SPEED_RESTRICTION` | `cancel_named_fix_speed_constraint` | existing_engine_candidate |
| `CANCEL SPEED RESTRICTION` | `CANCEL_SPEED_RESTRICTION` | `cancel_active_next_speed_constraint_or_confirm` | existing_engine_candidate |
| `CALLING/STATION CALLING/WHO CALLED` | `CONFIRM_CALLSIGN` | `radio_jam_one_station_repeat_or_callsign_confirm` | implemented |
| `AFFIRM` | `AFFIRM` | `execute_pending_confirmation` | existing_engine_candidate |
| `NEGATIVE` | `NEGATIVE` | `clear_pending_confirmation_no_state_change` | existing_engine_candidate |
| `SAY AGAIN` | `SAY_AGAIN` | `no_aircraft_state_change` | future_contract |
| `UNABLE` | `PILOT_UNABLE` | `no_aircraft_state_change` | future_contract |

## 상태 변경 경계

- parser는 aircraft state를 직접 바꾸지 않는다.
- LLM은 aircraft state를 직접 바꾸지 않는다.
- engine effect layer만 assigned speed/altitude/heading/route mode를 바꾼다.
- readback은 state change 결과가 아니라 accepted intent에 대한 response다.

## 구현 메모

`existing_engine_candidate`는 현재 sim에 유사 명령이 존재한다는 뜻이지, 이 contract JSON과 이미 연결됐다는 뜻은 아니다.

`future_contract`는 아직 motion/procedure engine 구현이 없는 명령이다. 그래도 LLM pilot agent가 나중에 임의 해석하지 않게 intent를 먼저 고정한다.

## DESCEND VIA Constraint Semantics

`DESCEND VIA`는 기본적으로 STAR lateral path, speed restrictions, altitude restrictions를 모두 따른다.

`DESCEND VIA ... TO {altitude} CANCEL LEVEL RESTRICTION`은 다르게 해석한다.

| Phrase | Lateral path | Speed restrictions | STAR altitude restrictions | Target altitude |
|---|---|---|---|---|
| `DESCEND VIA {arrival}` | follow | follow | follow | 별도 지시 없으면 기존 assigned altitude |
| `DESCEND VIA {arrival} TO {altitude}` | follow | follow | follow | `{altitude}` |
| `DESCEND VIA {arrival} TO {altitude} CANCEL LEVEL RESTRICTION` | follow | follow | cancel | `{altitude}` |

`CANCEL LEVEL RESTRICTION`은 STAR 경로를 취소하는 말이 아니다. STAR 경로와 speed restrictions는 유지하고, published STAR altitude/level restrictions만 취소한다.

취소되지 않는 안전 경계:

- MVA
- assigned target altitude
- approach clearance가 별도로 부여한 crossing altitude
- terrain/safety floor

APP/ILS에서 standalone으로 들어오는 `CANCEL LEVEL RESTRICTION`은 scope가 필요하다.

| Phrase | Parsed scope | Effect |
|---|---|---|
| `DESCEND VIA ... CANCEL LEVEL RESTRICTION` | `STAR` | STAR altitude restrictions만 취소 |
| `CANCEL YUMIN LEVEL RESTRICTION` | `APP_FIX`, `fix_id=YUMIN` | YUMIN altitude restriction만 취소 |
| `CANCEL LEVEL RESTRICTION AT LIMSO` | `APP_FIX`, `fix_id=LIMSO` | LIMSO altitude restriction만 취소 |
| `CANCEL LEVEL RESTRICTION` | `APP_ALL`, confirmation required | fix scope가 없어 자동 수행 금지 |

따라서 IAF만 cancel한 경우 IF/FAF/final profile은 살아있다.

## Speed Restriction Semantics

`SPEED {speed}`는 exact target이다.

`SPEED {speed} OR LESS`는 maximum ceiling이다. 느린 항공기를 그 속도까지 올리는 지시가 아니다.

`SPEED {speed} OR GREATER`는 minimum floor다. 빠른 항공기를 그 속도까지 내리는 지시가 아니다.

`MINIMUM SPEED`는 practical minimum으로 최대한 감속하라는 지시이며, 현재 target은 155 kt다. 이 값은 5000 ft 미만 자동 floor가 아니다.

우선순위:

1. 10000 ft / 250 kt hard cap
2. published STAR/APP speed restriction
3. controller speed policy target/minimum/maximum/minimum_practical
4. ILS final 5 NM 안쪽 aircraft-type landing speed
5. resume normal speed 이후 phase/profile default

published STAR/APP speed cap이 220 kt인데 controller가 250 kt target/floor를 주면, 제한 fix 5 NM 이내에서 자동 적용하지 않고 아래 확인을 요구한다.

```text
JJA123, confirm cancel speed restriction?
```

`CANCEL {fix} SPEED RESTRICTION`은 해당 fix의 speed restriction만 취소한다. 고도 제한은 그대로 유지된다.

`MAINTAIN {speed} OR GREATER UNTIL PASSING {altitude/fix}`는 release condition을 만족하면 controller speed policy를 해제하고 normal speed 상태로 돌아간다.

`confirm cancel speed restriction?` 다음의 `AFFIRM`은 별도 callsign 없이도 직전 pending confirmation을 승인하는 응답이다. 이때 engine은 보류된 speed restriction cancellation을 먼저 적용하고, 원래 보류된 speed 지시가 있으면 이어서 적용한다.

`NEGATIVE`는 pending confirmation을 취소하고 aircraft state를 바꾸지 않는다.
