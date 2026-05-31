# Phraseology Execution Sequence

작성일: 2026-05-09

## 목적

이 문서는 LLM 조종사 에이전트를 붙이기 전에 필요한 관제용어 계약 작업을 진행 순서대로 고정한다.

핵심 방향은 단순하다.

```text
관제 문장
  -> callsign/grammar/slot 검증
  -> intent JSON
  -> sim engine adapter
  -> deterministic aircraft control
  -> LLM pilot readback/confirm/unable
```

LLM은 항공기를 직접 조종하지 않는다. 항공기 조종은 sim engine이 하고, LLM은 조종사처럼 응답하는 층이다.

## 진행 순서

| 단계 | 작업 | 현재 상태 | 다음 연결 지점 |
|---|---|---|---|
| 1 | 공식 출처 register | 완료 | 법령/AIP 변경 시 갱신 |
| 2 | command taxonomy | 완료 | sim command menu와 id 맞추기 |
| 3 | grammar v0 | 완료 | 실제 입력 UI에 parser 연결 |
| 4 | intent/effect contract | 완료 | engine adapter가 effect 적용 |
| 5 | Jeju local command map | 완료 | RKPC procedure dataset과 cross-check |
| 6 | accepted alias | 완료 | 관제사가 실제로 쓰는 local phrase 추가 |
| 7 | response policy | 완료 | LLM pilot response gate로 연결 |
| 8 | parser/contract verification | 완료 | CI 또는 dev check로 연결 |
| 9 | sim adapter implementation | 대기 | 옆 스레드 sim code 작업 범위 |
| 10 | LLM pilot agent prompt/tool contract | 초안 완료 | parser output을 tool input으로 사용 |

## v0에서 이미 잡은 명령

- Heading: `TURN LEFT/RIGHT HEADING`, `FLY HEADING`, `LEFT TURN HEADING`
- Speed: `SPEED 180`, `MAINTAIN 220 KNOTS`, `SPEED 180 OR LESS`
- Conditional speed: `MAINTAIN 220 KNOTS OR GREATER UNTIL PASSING 10000`, `... UNTIL YUMIN`
- Altitude: `DESCEND 6000`, `CLIMB 9000`, `MAINTAIN 5000`
- Vertical speed: `DESCEND RATE 1500`, `CLIMB RATE 2000`
- Direct: `DIRECT YUMIN`, `PROCEED DIRECT YUMIN`
- Procedure: `CLEARED DOTOL 2P ARRIVAL`, `CLEARED KAMIT 2E DEPARTURE`
- Approach: `CLEARED ILS Z RWY 07`, `CLEARED ILS Z RUNWAY 25`, `CLEARED VISUAL APPROACH RUNWAY 07`
- Resume: `RESUME NORMAL SPEED`, `RESUME NORMAL CLIMB`, `RESUME NORMAL DESCENT`
- Missed/go-around: `GO AROUND`, `FLY MISSED APPROACH`
- Hold: `HOLD AT YUMIN`, `HOLD AT YUMIN LEFT TURNS 1 MINUTES`
- Descend via: `DESCEND VIA DOTOL 2P TO 9000`, `... CANCEL LEVEL RESTRICTION`

## 응답 정책

| 입력 상태 | 시스템 반응 |
|---|---|
| callsign 없음 | 조종사 응답 없음, state 변경 없음 |
| 현재 traffic에 없는 callsign | 조종사 응답 없음, state 변경 없음 |
| callsign 있음 + grammar 없음 | `{callsign}, say again.` |
| 의미는 추정되지만 애매함 | `{callsign}, confirm ...?` 후 확인 전까지 대기 |
| 값이 비정상 | `{callsign}, unable ...` |
| 정상 validated command | readback 후 engine adapter에 넘김 |

## Descend Via 규칙

`DESCEND VIA`는 기본적으로 STAR 경로, 속도 제한, 고도 제한을 모두 따른다.

`DESCEND VIA`에 `CANCEL LEVEL RESTRICTION` 또는 local alias `CANCEL LEVEL`이 붙으면 STAR 경로와 속도 제한은 유지하고, STAR 고도 제한만 취소한다.

APP/ILS에서 standalone `CANCEL LEVEL RESTRICTION`은 scope를 확인한다.

- `CANCEL YUMIN LEVEL RESTRICTION` -> YUMIN 제한만 취소
- `CANCEL LEVEL RESTRICTION AT LIMSO` -> LIMSO 제한만 취소
- `CANCEL LEVEL RESTRICTION` -> fix scope가 없어 confirm-before-execute

중요: `TO 4000`은 특별한 고정 규칙이 아니다. `TO {altitude}`는 관제사가 준 assigned target altitude다.

## Sim 연동 전제

parser와 LLM은 아래 값들을 직접 바꾸지 않는다.

- aircraft 위치
- altitude
- speed
- heading
- route/procedure state

대신 아래처럼 command request만 만든다.

```json
{
  "callsign": "JJA123",
  "intent": "DESCEND_VIA",
  "slots": {
    "procedure_id": "DOTOL",
    "procedure_compact": "2P",
    "altitude_ft": 9000,
    "constraint_policy": {
      "lateral_path": "follow",
      "speed_restrictions": "follow",
      "altitude_restrictions": "cancel"
    }
  }
}
```

이후 실제 항공기 상태 변경은 sim engine adapter가 한다.

## 검증 명령

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File phraseology_contract\scripts\validate_phraseology_contract.ps1
node phraseology_contract\scripts\verify-parser.mjs
node phraseology_contract\scripts\verify-response-policy.mjs
```
