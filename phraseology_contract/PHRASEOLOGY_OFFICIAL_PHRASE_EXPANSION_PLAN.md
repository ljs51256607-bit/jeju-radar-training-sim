# Official Phrase Expansion Plan

작성일: 2026-05-09

## 목적

현재 v0 grammar는 좁은 대표 표현만 포함한다. 다음 단계에서는 공식 문서 원문에서 phrase를 더 촘촘히 추출해야 한다.

## 확장 원칙

1. 국내 문서를 먼저 본다.
2. 같은 의미의 표현은 하나의 intent로 묶는다.
3. 공식 phrase가 아닌 제주 로컬 약어는 local map으로만 둔다.
4. LLM이 자연어를 임의 확장하지 않도록 grammar에 없는 표현은 `unparsed` 또는 `confirm`으로 보낸다.

## 우선 추출 대상

| Category | 우선 phrase |
|---|---|
| SPEED | assign speed, reduce speed, maintain speed, resume normal speed |
| ALTITUDE | climb, descend, maintain, altitude crossing |
| HEADING | fly heading, turn left/right heading |
| DIRECT | direct/proceed direct |
| PROCEDURE | cleared ILS/LOC/RNP/VOR approach, STAR/SID clearance |
| HOLD | hold at fix, left/right turns, leg time, maintain altitude |
| MISSED | go around, fly missed approach |
| READBACK | say again, readback correction |
| UNABLE | unable due performance/weather/traffic |

## 산출물

- `data/atc_command_grammar.json` 확장
- `data/pilot_readback_templates.json` 확장
- `data/atc_command_test_cases.json` 확장
- phrase별 source citation field 추가

