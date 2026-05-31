# Voice Phraseology Tolerance v1

작성일: 2026-05-25

## 목적

이 문서는 PTT로 들어온 관제 발화가 표준 grammar와 조금 달라도, 의미와 핵심 slot이 충분히 확실하면 시뮬레이터가 지시를 처리하도록 하는 기준을 고정한다.

핵심 목표는 `문법 매칭률`이 아니라 `관제 훈련 루프 유지`다.

```text
PTT speech
  -> STT transcript
  -> context normalization
  -> command chunk split
  -> semantic intent/slot extraction
  -> confidence policy
  -> validation
  -> partial apply + readback/confirm
```

LLM이나 tolerance layer는 aircraft state를 직접 바꾸지 않는다. state 변경은 기존 deterministic validation과 command runtime을 통과한 chunk에만 허용한다.

## 설계 원칙

1. `say again`은 최후 수단이다.
2. 한 문장 안의 일부 지시가 실패해도 전체를 버리지 않는다.
3. 확실한 지시는 적용하고, 애매한 slot만 confirm 또는 say again 한다.
4. 안전 핵심 slot은 느슨하게 추정하지 않는다.
5. traffic, sequence, missed-intention, radio jam은 aircraft motion command와 분리한다.
6. published hold와 ad-hoc hold 작업은 옆 thread의 `Ad-hoc Holding Clearance` 범위이므로 이 문서에서는 직접 구현하지 않는다.

## 적용 정책

| 정책 | 의미 | 예 |
|---|---|---|
| `APPLY` | intent와 필수 slot이 확실해서 적용 | `turn left hdg 270` |
| `PARTIAL_APPLY` | 여러 chunk 중 일부만 확실해서 확실한 chunk만 적용 | `heading 270, speed 180, cross YUMIN below ...` |
| `CONFIRM_BEFORE_APPLY` | intent는 보이나 안전 핵심 slot이 애매해서 확인 필요 | `descend six/sixteen thousand` |
| `READBACK_ONLY` | 정보/응답 flow라 aircraft state 변경 없음 | `traffic 2 o'clock...`, `you are number 2` |
| `NO_STATE_CHANGE` | 의미가 불충분하거나 대상이 불명확 | callsign 없음 + selected target 없음 |

## 안전 핵심 slot

아래 slot은 tolerance layer가 임의로 보정하면 안 된다. 후보가 하나로 좁혀지지 않으면 confirm 또는 partial say-again으로 보낸다.

- callsign
- turn direction: `left | right`
- heading number
- altitude
- runway
- fix
- assigned frequency

속도는 고도보다 위험도는 낮지만, 숫자가 확실하지 않으면 confirm한다.

## Chunk 분리 기준

한 발화는 여러 command chunk를 가질 수 있다.

```text
JJA117 turn left heading 270 reduce speed 180 descend 6000
```

기대 chunk:

```json
[
  { "intent": "ASSIGN_HEADING", "slots": { "turn_direction": "LEFT", "heading_deg": 270 } },
  { "intent": "ASSIGN_SPEED", "slots": { "speed_kt": 180 } },
  { "intent": "ASSIGN_ALTITUDE", "slots": { "altitude_ft": 6000 } }
]
```

chunk splitter는 `and`, `then`, 쉼표 같은 명시 구분자뿐 아니라 `heading`, `speed`, `descend`, `climb`, `direct`, `cleared`, `traffic`, `number` 같은 intent trigger를 기준으로도 분리해야 한다.

## Intent 범위

### HDG

- `ASSIGN_HEADING`
- `MAINTAIN_PRESENT_HEADING`
- `ONE_CIRCLE_HEADING`

`maintain hdg`처럼 숫자가 없는 표현은 기본적으로 `MAINTAIN_PRESENT_HEADING` 후보지만, voice setting에서 strict mode이면 confirm한다.

### SPD

- `ASSIGN_SPEED`
- `SPEED_UNTIL_FIX`
- `SPEED_UNTIL_FIX_THEN_NORMAL`
- `MAXIMUM_FORWARD_SPEED`
- `MINIMUM_SPEED`
- `RESUME_NORMAL_SPEED`

`reduce speed to minimum`, `minimum speed`, `maintain minimum speed`는 모두 minimum practical speed 계열로 묶는다.

### ALT

- `ASSIGN_ALTITUDE`
- `EXPEDITE_DESCENT`
- `EXPEDITE_CLIMB`
- `CROSS_FIX_RESTRICTION`

`cross FIX below altitude`와 `cross FIX at or below altitude`는 immediate altitude command가 아니라 crossing restriction이다.

### APPROACH

- `CLEARED_ILS`

`cleared ils z runway25 approach`, `cleared ils z rwy 25`, `cleared ils z runway 07`을 같은 intent로 본다.

### DIRECT

- `DIRECT_TO_FIX`
- `TURN_DIRECT_FIX`

`turn left direct YUMIN`은 direct command에 turn direction metadata를 붙인다. 단순 heading command로 해석하지 않는다.

### TRAFFIC

- `TRAFFIC_INFORMATION`

traffic 정보는 readback-only다. aircraft state를 바꾸지 않는다.

### SEQUENCE

- `SEQUENCE_NUMBER`

`you are number 2`, `sequence number 2`, STT mishear `yorn number 2`를 같은 정보 flow로 본다.

### MISSED

- `ASK_INTENTIONS`
- `REQUEST_ONE_MORE_APPROACH`

관제사가 복행 항공기에 `say intentions` 또는 `confirm one more approach?`를 말하면, 조종사는 state를 바꾸지 않고 intention response를 한다.

### RADIO

- `JAMMED_TRANSMISSION`
- `CONFIRM_CALLSIGN`

radio jam은 parser failure가 아니라 radio event다. 둘 이상이 동시에 부르면 readable transcript 대신 jam event와 candidate callsigns를 만든다.
시뮬레이터 playback에서도 radio jam은 readback 문장이 아니다. `blocked transmission`은 TTS 텍스트로 읽지 않고 local radio-noise burst로 재생한다.

## Readback 정책

정상 지시는 command summary를 묶어서 readback한다.

```text
Heading 270, speed 180, descend 6000, JJA117.
```

partial apply는 적용된 chunk와 실패한 chunk를 분리한다.

```text
Heading 270, speed 180, JJA117. Say again crossing altitude.
```

traffic 정보:

```text
Traffic in sight, JJA117.
```

또는 시야 미확보 variant:

```text
Looking out, JJA117.
```

sequence 정보:

```text
Number 2, JJA117.
```

missed intention:

```text
Request vectors for one more approach, JJA117.
```

radio jam:

```text
ZZZZZT / blocked transmission noise
```

이후 controller가 `calling station say again`, `station calling say again`, `who called`, 한국어 `누가 불렀어`처럼 호출자를 묻거나 반복을 요청하면 candidate 중 하나가 다시 first call을 한다. `confirm callsign`은 전체 jammed aircraft를 한꺼번에 부르는 명령이 아니라 callsign 확인 흐름으로 남긴다.

## 구현 경계

현재 문서는 구현 전 contract다. 옆 thread의 `Ad-hoc Holding Clearance`가 끝나기 전에는 아래 파일을 직접 수정하지 않는다.

- `jeju-radar-ui/src/lib/atcCommandParser.ts`
- `jeju-radar-ui/src/lib/atcCommandBatch.ts`
- `jeju-radar-ui/src/lib/atcCommandApplication.ts`
- `jeju-radar-ui/src/lib/types.ts`
- `jeju-radar-ui/scripts/verify-holding-*.mjs`

이 문서와 `data/voice_phraseology_tolerance_acceptance_cases.json`은 이후 parser/runtime 구현의 acceptance 기준으로 사용한다.
