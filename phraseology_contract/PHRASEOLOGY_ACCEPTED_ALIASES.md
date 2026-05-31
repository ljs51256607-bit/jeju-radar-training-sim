# Phraseology Accepted Aliases

작성일: 2026-05-09

## 목적

실제 운용에서 들어올 수 있는 축약/순서 변경 표현을 canonical intent로 정규화한다.

이 문서는 표준관제용어를 대체하지 않는다. 앱 입력 편의를 위해 허용하는 alias 목록이다.

## 원칙

- canonical phrase와 accepted alias를 구분한다.
- accepted alias는 내부에서 기존 canonical intent로만 변환한다.
- 애매한 alias는 parser가 받아들이지 않고 confirm 대상으로 둔다.
- alias가 aircraft state를 직접 바꾸지 않는다.

## v0 Accepted Aliases

| Accepted alias | Canonical intent | 의미 |
|---|---|---|
| `SPEED {speed} OR LESS` | `MAINTAIN_SPEED_LIMIT` | maximum speed ceiling |
| `MAINTAIN {speed} OR LESS` | `MAINTAIN_SPEED_LIMIT` | maximum speed ceiling |
| `MAINTAIN {speed} OR GREATER` | `MAINTAIN_SPEED_LIMIT` | minimum speed floor |
| `MINIMUM SPEED` | `MINIMUM_SPEED` | practical deceleration target 155 kt |
| `LEFT TURN HEADING {heading}` | `ASSIGN_HEADING` | `TURN LEFT HEADING {heading}` alias |
| `RIGHT TURN HEADING {heading}` | `ASSIGN_HEADING` | `TURN RIGHT HEADING {heading}` alias |
| `CLEARED ILS Z RWY {runway}` | `CLEARED_ILS` | `RUNWAY` abbreviation alias |
| `CLEARED VISUAL RWY {runway}` | `CLEARED_VISUAL_APPROACH` | visual approach clearance runway abbreviation |
| `CLEARED FOR VISUAL APPROACH RWY {runway}` | `CLEARED_VISUAL_APPROACH` | common clearance wording with `FOR` |
| `DESCEND VIA {fix} {compact} TO {altitude} CANCEL LEVEL` | `DESCEND_VIA` | compact STAR name + cancel level alias |
| `CANCEL {fix} LEVEL RESTRICTION` | `CANCEL_LEVEL_RESTRICTION` | APP fix-scoped altitude restriction cancellation |
| `CANCEL LEVEL RESTRICTION AT {fix}` | `CANCEL_LEVEL_RESTRICTION` | APP fix-scoped altitude restriction cancellation |

## 현재 의도적으로 제외한 alias

| 표현 | 제외 이유 |
|---|---|
| `LEFT 180` | heading assignment인지 relative turn인지 애매함 |
| `{fix}` 단독 | direct인지 STAR/SID인지 애매함 |
| `CLEARED APPROACH RUNWAY 07` | approach type이 빠져 current approach context가 필요함 |
