# Phraseology Response Policy

작성일: 2026-05-09

## 목적

관제 입력이 parser/validation을 통과하지 못했을 때 LLM 조종사 에이전트가 어떻게 응답할지 고정한다.

이 정책의 가장 중요한 원칙은 `no validated intent, no aircraft state change`다.

앱 runtime에서는 이 정책을 `pilot_response_payload`로 표준화한다. LLM은 payload의 `speakable_text`를 말하거나 말투만 다듬을 수 있고, `engine_action`이나 aircraft state를 바꾸면 안 된다.

LLM pilot voice runtime은 local proxy 뒤에 둔다. Browser는 `pilot_response_payload`만 보내고, OpenAI API key는 server-side에서만 사용한다. API 실패, guard 실패, key 없음 상태에서는 기존 deterministic `speakable_text`로 돌아간다.

## 핵심 정책

| 상황 | Response | Engine action |
|---|---|---|
| callsign 없음 | silent no response | no state change |
| callsign은 있으나 현재 traffic에 없음 | silent no response | no state change |
| callsign 있음 + grammar 미매칭 | say again | no state change |
| callsign 있음 + ambiguous alias | confirm intent | hold pending confirmation |
| callsign 있음 + slot 값 이상 | unable 또는 confirm | no state change |
| callsign 있음 + fix/procedure 없음 | say again fix/procedure 또는 unable | no state change |
| callsign 있음 + safety/rule conflict | unable | no state change |
| validated command | readback | apply after validation |

## Pilot Response Payload

필수 필드:

- `condition`: 왜 이 응답이 나왔는지
- `response_action`: `READBACK`, `SAY_AGAIN`, `CONFIRM_INTENT`, `CONFIRM_CANCEL_SPEED_RESTRICTION`, `UNABLE`, `SILENT_NO_RESPONSE`
- `engine_action`: `APPLY_AFTER_VALIDATION`, `HOLD_PENDING_CONFIRMATION`, `APPLY_PENDING_CONFIRMATION`, `CLEAR_PENDING_CONFIRMATION`, `NO_STATE_CHANGE`
- `speakable_text`: 실제 조종사가 말할 문장
- `llm_allowed_actions`: `say_text`, `polish_phraseology`
- `llm_forbidden_actions`: state mutation, validation override, engine effect 적용 금지

## LLM Pilot Voice Runtime

LLM pilot voice의 입력은 `pilot_response_payload` 하나다.

출력은 조종사 voice text 한 줄이다.

정책:

- `SILENT_NO_RESPONSE`는 LLM을 호출하지 않는다.
- LLM이 callsign을 빼거나 바꾸면 deterministic `speakable_text`로 fallback한다.
- LLM이 숫자 token을 바꾸면 fallback한다.
- `READBACK`을 질문으로 바꾸면 fallback한다.
- OpenAI API key는 browser bundle, response JSON, log에 노출하지 않는다.

## 왜 callsign 없음은 silent인가

무선교신에서 대상 항공기를 알 수 없는 지시에 조종사가 응답하면 더 위험하다.

따라서 v0에서는 아래 입력에 어떤 pilot response도 생성하지 않는다.

```text
DESCEND 6000
SPEED 180
TURN LEFT HEADING 270
```

UI 내부 로그에는 남길 수 있지만, 항공기/LLM 조종사는 응답하지 않는다.

## Unknown callsign

아래처럼 callsign 형식은 있으나 현재 traffic에 없는 경우도 silent로 처리한다.

```text
XXX999 DESCEND 6000
```

이유: 실제 radio 상황에서 내 callsign이 아니면 응답하지 않는 것이 기본 동작이다.

## Ambiguous alias

아래처럼 의미 후보가 있지만 명확하지 않은 표현은 confirm으로 보낸다.

```text
JJA123 LEFT 180
```

APP/ILS에서 fix가 빠진 level restriction cancel도 confirm 대상이다.

```text
JJA123 CANCEL LEVEL RESTRICTION
```

응답 예:

```text
JJA123, confirm cancel all approach level restrictions?
```

정책:

```text
JJA123, confirm turn left heading 180?
```

확인 전까지 engine은 no state change다.

published STAR/APP speed cap과 controller speed target/floor가 제한 fix 5 NM 이내에서 충돌하면 speed restriction cancel 여부를 먼저 확인한다.

```text
JJA123 SPEED 250
```

응답 예:

```text
JJA123, confirm cancel speed restriction?
```

`CANCEL SPEED RESTRICTION`에 fix scope가 없고 active conflict도 없으면 동일하게 confirm 대상이다. 확인 전까지 engine은 no state change다.

## Confirm에 대한 관제사 응답

시스템/조종사가 confirm을 물으면 관제사는 새 지시가 아니라 confirmation response를 준다.

```text
JJA123, confirm cancel speed restriction?
AFFIRM
```

정책:

- `AFFIRM`은 직전 pending confirmation을 승인한다.
- speed restriction conflict에서 `AFFIRM`이 들어오면 pending restricted fix를 취소하고, 원래 보류된 speed 지시를 이어서 적용한다.
- `NEGATIVE`는 pending confirmation을 취소하고 aircraft state를 바꾸지 않는다.
- pending confirmation이 없는데 `AFFIRM`이 들어오면 state change 없이 say again/no pending confirmation으로 처리한다.

## No pattern match with callsign

callsign은 있지만 지시를 못 알아들으면 say again을 생성한다.

```text
JJA123 BLAH BLAH
```

응답:

```text
JJA123, say again.
```

## Invalid or unsafe command

값이 비정상적이거나 safety/rule conflict가 있으면 unable로 처리한다.

```text
JJA123 SPEED 900
```

응답:

```text
JJA123, unable speed 900.
```

## Broadcast 예외

`ALL STATIONS`, ATIS, traffic broadcast 같은 broadcast phrase는 v0 범위에서 제외한다.

나중에 추가하더라도 normal aircraft command parser와 별도 category로 분리한다.
