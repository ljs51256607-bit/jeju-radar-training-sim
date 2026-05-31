# Phraseology Readback Templates

작성일: 2026-05-09

## 목적

나중에 LLM 조종사 에이전트가 readback을 생성할 때 의미를 바꾸지 않도록 template을 고정한다.

## 원칙

- readback은 accepted command intent와 slots만 사용한다.
- LLM은 readback에 새 clearance를 추가하지 않는다.
- callsign은 반드시 포함한다.
- altitude, heading, speed, runway, fix는 원문 slot과 동일해야 한다.
- 불확실하면 `SAY AGAIN` 또는 `CONFIRM` 계열 response로 간다.

## Template 예시

| Intent | Template |
|---|---|
| `ASSIGN_HEADING` | `{instruction}, {callsign}` |
| `ASSIGN_SPEED` | `{instruction}, {callsign}` |
| `RESUME_NORMAL_SPEED` | `Resume normal speed, {callsign}` |
| `ASSIGN_ALTITUDE` | `{instruction}, {callsign}` |
| `DIRECT_TO_FIX` | `Direct {fix}, {callsign}` |
| `CLEARED_ILS` | `Cleared ILS {runway}, {callsign}` |
| `CLEARED_VISUAL_APPROACH` | `Cleared visual approach runway {runway}, {callsign}` |
| `GO_AROUND` | `Going around, {callsign}` |
| `HOLD_AT_FIX` | `Hold at {fix}, {turn_direction} turns, {leg_time_minutes} minute legs, {callsign}` |
| `DESCEND_VIA` | `Descend via {procedure}, {callsign}` |
| `CANCEL_LEVEL_RESTRICTION` | `Cancel {fix} level restriction, {callsign}` |

## LLM 사용 방식

LLM prompt에는 전체 법령 원문을 넣지 않는다. 대신 parser 결과를 넘긴다.

```json
{
  "callsign": "JJA123",
  "intent": "ASSIGN_SPEED",
  "slots": {
    "speed_kt": 210
  },
  "template_id": "assign_speed_basic"
}
```

LLM은 위 정보를 기반으로 자연스러운 readback 문장을 만들되, 의미를 바꾸면 안 된다.
