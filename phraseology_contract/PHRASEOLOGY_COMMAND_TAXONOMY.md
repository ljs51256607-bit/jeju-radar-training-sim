# Phraseology Command Taxonomy

작성일: 2026-05-09

## 목적

관제사가 입력하거나 말하는 문장을 simulator command intent로 바꾸기 위한 분류 체계를 고정한다.

## Taxonomy

| Category | 의미 | v0 포함 여부 |
|---|---|---|
| `SPEED` | 속도 배정, 감속, 유지, resume normal speed | 포함 |
| `ALTITUDE` | climb, descend, maintain altitude | 포함 |
| `VERTICAL` | vertical speed, resume normal climb/descent | 포함 |
| `HEADING` | fly heading, turn left/right heading | 포함 |
| `DIRECT` | direct-to-fix | 포함 |
| `PROCEDURE` | STAR/SID/ILS/approach clearance | 포함 |
| `MISSED` | go-around, missed approach | contract만 포함 |
| `HOLD` | holding instruction | contract만 포함 |
| `COMM` | contact, monitor, frequency transfer | contract만 포함 |
| `READBACK` | readback, correction, say again | contract만 포함 |
| `UNABLE` | 조종사 unable/confirm response | contract만 포함 |

## 설계 원칙

- category는 UI tab이 아니라 command intent grouping이다.
- 하나의 phrase가 여러 state change를 만들 수 있어도 intent는 하나로 유지한다.
- 실제 항공기 state 변경은 `atc_command_effects.json`에서만 정의한다.
- LLM은 taxonomy를 기준으로 답하지만, taxonomy 자체를 확장하지 않는다.

## 우선 구현 세트

1. `SPEED`: assign speed, reduce speed, maintain speed, resume normal speed
2. `ALTITUDE`: climb, descend, maintain altitude
3. `VERTICAL`: assign vertical speed, resume normal climb/descent
4. `HEADING`: fly heading, turn left/right heading
5. `DIRECT`: direct to fix
6. `PROCEDURE`: cleared STAR/SID/ILS

## 이후 구현 세트

1. `MISSED`: go around, fly missed approach
2. `HOLD`: hold at fix with leg time, turn direction, altitude
3. `PROCEDURE`: descend via STAR
4. `UNABLE`: unable due performance/traffic/terrain
5. `COMM`: contact/monitor/frequency transfer

