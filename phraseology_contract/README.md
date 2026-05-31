# Phraseology Contract Workbench

작성일: 2026-05-09

## 목적

이 폴더는 LLM 조종사 에이전트를 붙이기 전에 필요한 관제용어/명령 계약을 독립적으로 설계하는 작업 공간이다.

현재 목표는 앱 런타임을 수정하는 것이 아니라, 관제 문장을 아래 흐름으로 정규화할 수 있게 만드는 것이다.

```text
ATC phrase
  -> phraseology grammar
  -> command intent
  -> engine effect contract
  -> pilot readback template
  -> future LLM pilot agent
```

## 경계

- 이 폴더의 파일은 아직 `jeju-radar-ui/src`에서 직접 읽지 않는다.
- LLM은 항공기 state를 직접 수정하지 않는다.
- 실제 조종/기동은 deterministic simulator engine이 수행한다.
- LLM은 readback, confirm, unable, pilot-like response를 생성하는 역할만 맡는다.

## 산출물

| 파일 | 역할 |
|---|---|
| `PHRASEOLOGY_SOURCE_REGISTER.md` | 표준관제용어 출처와 우선순위 |
| `PHRASEOLOGY_COMMAND_TAXONOMY.md` | 관제 명령 분류 체계 |
| `PHRASEOLOGY_COMMAND_MAP.md` | phrase -> intent -> effect 연결 설명 |
| `PHRASEOLOGY_ENGINE_EFFECTS.md` | intent가 simulator state에 주는 영향 |
| `PHRASEOLOGY_READBACK_TEMPLATES.md` | LLM 조종사 readback template 원칙 |
| `PHRASEOLOGY_RESPONSE_POLICY.md` | parse/validation 실패 시 say again/confirm/unable/silent 정책 |
| `PHRASEOLOGY_EXECUTION_SEQUENCE.md` | LLM 조종사 연결 전 작업 순서와 현재 상태 |
| `PHRASEOLOGY_VOICE_TOLERANCE_SPEC.md` | PTT/STT 발화 tolerance와 partial apply 정책 |
| `PHRASEOLOGY_VOICE_TOLERANCE_IMPLEMENTATION_PLAN.md` | voice tolerance 구현 순서와 검증 계획 |
| `LLM_PILOT_AGENT_CONTRACT.md` | future LLM pilot agent 역할/금지사항 |
| `data/*.json` | 기계가 읽을 contract 초안 |
| `scripts/*.mjs`, `scripts/*.ps1` | parser, response policy, JSON/참조 무결성 검증 |

## 진행 순서

1. 출처 register 고정
2. 명령 taxonomy 고정
3. grammar v0 작성
4. command intent map 작성
5. engine effect contract 작성
6. Jeju local command map 작성
7. accepted alias 정리
8. readback/response policy 작성
9. test case 작성
10. 검증 스크립트 통과
11. sim adapter 구현으로 넘김

## v0 범위

v0는 제주 APP 훈련 화면에 바로 연결 가능한 명령과, 다음 구현 슬라이스에 필요한 명령을 함께 정의한다.

- 기존 엔진 연결 후보: `HDG`, `SPD`, `ALT`, `VS`, `DCT`, `STAR`, `SID`, `ILS`
- 추가 grammar 후보: `MAINTAIN SPEED OR GREATER/LESS`, `UNTIL PASSING altitude`, `UNTIL fix`
- 다음 구현 후보: `RESUME NORMAL SPEED`, `RESUME NORMAL CLIMB`, `RESUME NORMAL DESCENT`, `DESCEND VIA`
- radio jam 구현됨: `CONFIRM_CALLSIGN`은 `calling/station calling/who called/누가 불렀어` 계열을 jammed station repeat 흐름으로 분리한다.
- 이후 확장 후보: `GO AROUND`, `MISSED APPROACH`, `HOLD`, `UNABLE`, `SAY AGAIN`

## 검증

현재 계약은 아래 세 검증으로 확인한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File phraseology_contract\scripts\validate_phraseology_contract.ps1
node phraseology_contract\scripts\verify-parser.mjs
node phraseology_contract\scripts\verify-response-policy.mjs
node phraseology_contract\scripts\verify-voice-tolerance-cases.mjs
```
