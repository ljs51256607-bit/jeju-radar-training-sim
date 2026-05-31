# LLM Pilot Agent Contract

작성일: 2026-05-09

## 목적

미래의 LLM 조종사 에이전트가 simulator engine과 어떤 경계로 연결될지 정의한다.

## 역할

LLM 조종사는 교신 역할을 맡는다.

허용:

- accepted command에 대한 readback 생성
- 잘못 들은 상황에서 `SAY AGAIN`
- 불명확한 지시에서 `CONFIRM`
- 성능/안전/절차상 수행 불가 상황에서 `UNABLE`
- 설정된 확률에 따른 readback 오류 또는 지연 생성

금지:

- aircraft latitude/longitude 직접 변경
- speed/altitude/heading 직접 변경
- route mode 직접 변경
- procedure route 임의 생성
- 표준용어 register 밖의 표현을 표준용어처럼 확장
- 법규/절차 충돌을 무시하고 clearance를 수락

## Runtime Boundary

```text
controller phrase
  -> phraseology parser
  -> command intent
  -> validation
  -> LLM pilot readback
  -> accepted command
  -> deterministic engine effect
  -> aircraft motion model
```

## Failure Response

LLM pilot이 쓸 수 있는 failure response는 아래 계열로 제한한다.

| Situation | Response family |
|---|---|
| phrase 불명확 | `SAY_AGAIN` |
| callsign mismatch | ignore 또는 `CONFIRM_CALLSIGN` |
| slot 값 누락 | `CONFIRM` |
| 성능상 불가 | `UNABLE_PERFORMANCE` |
| 절차상 불가 | `UNABLE_PROCEDURE` |
| readback 오류 훈련 | configured error model |

## 구현 전제

LLM을 붙이기 전에 아래 contract가 먼저 필요하다.

- source register
- command grammar
- command intent map
- engine effect map
- readback template
- validation test cases

