# Radar Symbology Spec

## 목적

이 문서는 제주 접근관제 시뮬레이터의 레이더 심볼 표시 규칙을 고정한다.

`AIRCRAFT_DATABLOCK_SPEC.md`가 데이터블록 4줄 구조를 담당한다면, 이 문서는 항공기 position symbol, predictor line, leader line의 의미와 계산 규칙을 담당한다.

## 적용 범위

- 항공기 현재 위치 심볼
- 항공기 heading / speed 기반 predictor line
- 항공기 심볼과 데이터블록을 연결하는 leader line
- ATC console의 radio queue status overlay
- 이후 aircraft state tick, heading command, speed command 구현

## Radio Queue Overlay

ATC console은 현재 처리해야 할 radio flow를 `RADIO Q`로 표시한다.

이 표시는 traffic flow 판단용 overlay이며 항공기 위치 source-of-truth가 아니다.

| 코드 | 의미 | 표시 조건 |
|---|---|---|
| `CALL` | 조종사가 호출했고 관제사 응답을 기다리는 현재 radio transaction | `pilot_first_contact.awaiting_controller_response=true` |
| `JAM` | 동시에 송신되어 jammed 상태로 남은 first-contact caller | `pilot_first_contact.last_jammed_at_ms`가 있고 아직 완료되지 않음 |
| `SBY` | 관제사가 `standby`로 잡아 둔 항공기 | `pilot_first_contact.standby=true` |

정렬 규칙:

1. `CALL`을 먼저 표시한다. 현재 통신 트랜잭션이므로 관제사가 먼저 응답해야 한다.
2. `JAM`은 최신 unresolved jam group을 먼저 표시한다.
3. 같은 jam group 안에서는 scenario traffic order를 유지한다.
4. `SBY`는 뒤에 남겨 관제사가 나중에 다시 부를 수 있게 한다.

Queue action:

| 버튼 | 생성하는 ATC command | 사용 |
|---|---|---|
| `SAY` | `{callsign} say again` | jammed caller를 하나 골라 다시 initial call을 시킴 |
| `GO` | `{callsign} go ahead` | 해당 caller를 현재 radio transaction으로 받아 주거나 standby를 해제 |
| `SBY` | `{callsign} standby` | 해당 caller를 standby 상태로 둠 |

Queue action은 별도 상태 변경 shortcut이 아니다. 버튼은 ATC command text를 생성하고 기존 parser/runtime 경로로 실행한다.

Selected aircraft panel에도 같은 radio action을 표시한다. 선택된 항공기가 `RADIO Q`에 있으면 panel에 `RADIO CALL/JAM/SBY` row를 띄우고, 해당 row에서 허용되는 `SAY/GO/SBY`만 버튼으로 제공한다. Scope keyboard의 `G/A/B`도 선택 항공기 기준 `go ahead/say again/standby` command를 만들되, 선택 항공기가 해당 radio queue action 대상이 아니면 아무 command도 실행하지 않는다.

## 항공기 현재 위치 심볼

항공기 현재 위치는 작은 원으로 표시한다.

현재 기준:

- 삼각형 aircraft icon은 사용하지 않는다.
- 원의 중심은 항공기의 현재 위도/경도다.
- 원의 색은 관제 소유권 색상 규칙을 따른다.
- APP 항공기와 DEP 항공기는 서로 다른 색상 계열로 표시한다.

심볼은 항공기의 기수 방향을 표현하지 않는다. 기수 방향과 속도 예측은 predictor line으로 표현한다.

## Predictor Line

항공기 심볼 앞의 선은 장식용 heading line이 아니다.

이 선은 `30초 동안 항공기가 현재 ground speed와 heading을 유지할 경우 도달하는 위치`를 나타내는 predictor vector다.

즉 선의 시작점은 현재 항공기 위치이고, 선의 끝점은 30초 후 예상 위치다.

## Predictor Line 계산 규칙

입력값:

| 필드 | 의미 | 단위 |
|---|---|---|
| `latitude` | 현재 위도 | degree |
| `longitude` | 현재 경도 | degree |
| `heading_true_deg` | 내부 이동 계산용 true heading | degree |
| `ground_speed_kt` | 현재 지상속도 | knot |

계산:

```text
prediction_time_sec = 30
prediction_time_hr = 30 / 3600 = 1 / 120
predictor_distance_nm = ground_speed_kt * prediction_time_hr
predictor_distance_nm = ground_speed_kt / 120
```

예시:

| Ground speed | 30초 이동거리 |
|---:|---:|
| 180 kt | 1.50 NM |
| 210 kt | 1.75 NM |
| 250 kt | 2.08 NM |
| 300 kt | 2.50 NM |
| 360 kt | 3.00 NM |

## End Point 산출 규칙

predictor line의 끝점은 screen pixel 고정 길이로 만들면 안 된다.

반드시 아래 순서로 계산한다.

1. 현재 위도/경도에서 시작한다.
2. `heading_true_deg` 방향으로 `predictor_distance_nm`만큼 이동한 지리 좌표를 계산한다.
3. 현재 radar projector로 시작 좌표와 끝 좌표를 각각 screen 좌표로 변환한다.
4. 두 screen 좌표를 선으로 연결한다.

작은 TMA 범위에서는 local tangent/equirectangular 근사도 시각적으로 충분할 수 있다. 다만 구현 기본값은 destination point 계산 또는 검증된 geodesic helper를 우선한다.

## Magnetic / True Heading 기준

관제사가 패널에서 입력하고 화면에서 확인하는 `HDG`는 자북 기준 magnetic heading이다.

내부 좌표 이동과 predictor endpoint 계산은 true heading을 사용한다.

RKPC reference data 기준 자기편차:

```text
mag_var = 8° W (2025) / 0.042° increasing
```

현재 구현 변환:

```text
true_heading = magnetic_heading - 8
magnetic_heading = true_heading + 8
```

따라서 사용자가 패널에 `HDG 090`을 입력하면 내부 이동 계산은 `082 true`로 수행한다.

## Zoom 동작

predictor line은 지도 좌표에 종속된다.

따라서 zoom-in / zoom-out 시 화면상 길이는 지도와 함께 변해야 한다. 고정 pixel 길이로 유지하면 안 된다.

## Missing Data 처리

| 조건 | 처리 |
|---|---|
| `ground_speed_kt`가 없거나 0 이하 | predictor line을 숨기거나 길이 0으로 표시 |
| `heading_true_deg`가 없거나 숫자가 아님 | predictor line을 숨김 |
| aircraft position이 유효하지 않음 | 항공기 심볼과 데이터블록을 표시하지 않음 |

## Leader Line과의 구분

predictor line과 leader line은 의미가 다르다.

| 선 | 의미 |
|---|---|
| Predictor line | 현재 항공기가 30초 동안 진행할 예상 위치 |
| Leader line | 항공기 현재 위치와 데이터블록을 연결하는 표시선 |

leader line은 데이터블록 배치용 UI 선이다. 속도나 heading 의미를 갖지 않는다.

## 데이터블록 Hover / Drag Interaction

데이터블록은 항공기 현재 위치와 별개로 사용자가 배치할 수 있어야 한다.

기본 원칙:

- 항공기 원형 심볼의 좌표는 aircraft state의 현재 위도/경도다.
- 데이터블록을 드래그해도 항공기 좌표는 바뀌지 않는다.
- 드래그는 해당 항공기의 데이터블록 상대 offset만 바꾼다.
- leader line은 이동된 데이터블록 위치로 자동 갱신한다.
- 데이터블록 drag 중에는 radar map pan이 같이 작동하면 안 된다.

Hover 표시:

- 평소 데이터블록 배경 박스는 보이지 않거나 완전히 투명하다.
- 마우스를 데이터블록 위에 올리면 뒤에 반투명 직사각형 박스가 나타난다.
- 이 박스는 데이터블록이 잡을 수 있는 영역을 보여주는 interaction affordance다.
- 박스는 지도 정보를 가리면 안 된다. TMA 선, fix, 절차선이 박스 뒤로 계속 보여야 한다.
- 권장 배경 투명도는 `rgba(0, 18, 22, 0.28~0.38)` 수준이다.
- 테두리는 얇고 약하게 표시한다.

Drag 표시:

- drag 중에도 hover와 같은 반투명 박스를 유지한다.
- cursor는 hover 시 grab, drag 중 grabbing으로 표시한다.
- drag 중 데이터블록 text, leader line, 항공기 심볼은 계속 보여야 한다.

상태 저장:

```text
datablock_offset_by_aircraft_id = {
  [aircraft_id]: { x, y }
}
```

offset은 screen fixed pixel이 아니라 radar map 좌표계 offset이다. zoom 변경 시 지도 위 상대 위치와 leader line 관계가 자연스럽게 유지되어야 한다.

## Measure / Bearing Line Interaction

항공기 원형 심볼을 왼쪽 마우스 버튼으로 누른 채 드래그하면 항공기 현재 위치에서 pointer 지점까지 측정선을 만든다.

이 선은 predictor line이 아니다. 관제사가 임의 지점 또는 fix까지 거리, 방위, 도착 예상시간을 재기 위한 조작선이다.

기본 동작:

- 항공기 근처 snap 영역에 들어가면 native cursor는 그대로 보이고, 심볼 중심에 snap cursor를 추가 표시한다.
- snap 판정은 항공기 hitbox 이벤트만이 아니라 radar SVG pointer position 기준으로 가장 가까운 항공기를 계산해 수행한다.
- snap 상태에서 왼쪽 버튼을 누르면 측정선은 심볼 중심에서 시작한다.
- snap 영역에 들어가는 것만으로는 측정선을 만들지 않는다. 반드시 mouse down / drag가 있어야 한다.
- 측정 시작 시 항공기 command panel은 닫아 측정 label과 map interaction을 가리지 않게 한다.
- 시작점은 드래그를 시작한 항공기의 현재 위도/경도다.
- 끝점은 기본적으로 마우스 pointer가 위치한 screen point를 radar projector로 역변환한 실제 위도/경도다.
- 드래그 중 pointer가 다른 항공기 심볼 snap 영역에 들어가면 끝점은 고정 좌표가 아니라 해당 항공기의 현재 위도/경도에 붙는다.
- 드래그 중에는 선과 label을 실시간 표시한다.
- 마우스 버튼을 놓으면 해당 측정선을 고정한다.
- 고정된 뒤에도 시작점은 `aircraftId` 기준으로 항공기 현재 위치를 계속 따라간다.
- 항공기-항공기 측정선으로 고정된 경우 끝점도 `endAircraftId` 기준으로 상대 항공기 현재 위치를 계속 따라간다. 이는 최종접근로에서 선행기-후행기 간격을 계속 감시하기 위한 기능이다.
- 고정된 측정선의 마지막 끝점에는 작은 chain anchor를 표시한다. 보이는 점은 작게 유지하되, 클릭/드래그 판정은 더 넓은 투명 hitbox로 잡는다.
- chain anchor를 왼쪽 버튼으로 잡고 드래그하면 이전 끝점에서 다음 지점까지 이어지는 새 측정 leg를 만든다.
- 이전 끝점이 항공기 snap 끝점이면 새 leg의 시작점도 그 항공기를 계속 따라간다.
- 연속 측정은 최대 5개 leg까지만 허용한다.
- 항공기 심볼에서 새 측정을 시작하면 기존 chain은 지우고 새 chain으로 교체한다.
- 연속 측정 label의 거리와 ETA는 현재 leg 단독값이 아니라 첫 leg부터 현재 leg까지의 누적값이다.
- 방위는 누적하지 않는다. 방위 label은 현재 leg의 시작점에서 끝점까지의 magnetic heading이다.
- 고정된 측정선의 거리/방위/ETA label box를 좌클릭하면 chain 전체를 삭제한다.
- label 삭제 hitbox는 항공기 symbol/hitbox보다 위에 별도 overlay로 렌더링해 짧은 측정선에서도 항공기 hitbox에 클릭이 빼앗기지 않게 한다.
- label 주변과 측정선 중앙부에는 넓은 투명 삭제 hitbox를 둔다. 단, 끝점 chain anchor 드래그를 방해하지 않도록 선 전체가 아니라 중앙부만 삭제 hitbox로 사용한다.
- SVG hit testing이 항공기 hitbox와 충돌할 수 있으므로 label 삭제 영역에는 투명 HTML button을 `foreignObject`로 한 번 더 올려 좌클릭 삭제를 안정화한다.
- 최종 click target은 radar-shell 위에 absolute HTML button으로도 중복 배치한다. 이 overlay는 SVG pointer-event 충돌과 무관하게 label 위치 좌클릭 삭제를 보장한다.
- 측정 label box의 우클릭은 브라우저 context menu가 뜨지 않도록 차단만 한다.
- `CLR` 버튼은 고정된 측정선을 모두 삭제한다.
- DIRECT TO FIX는 측정선과 별도 명령이다. 선택된 항공기가 있을 때 지도상의 direct 가능 fix를 좌클릭해 적용한다.

측정 label:

```text
{distance_nm}NM {magnetic_bearing} {eta_min}MIN
```

| 항목 | 기준 |
|---|---|
| `distance_nm` | 첫 leg부터 현재 leg까지 누적한 great-circle distance, NM |
| `magnetic_bearing` | 현재 leg 시작점에서 현재 leg 끝점으로 향하는 초기방위, magnetic heading |
| `eta_min` | 누적 `distance_nm / ground_speed_kt * 60` |

방위 표시는 관제 패널과 동일하게 자북 기준이다.

RKPC 현재 구현에서는 true bearing에 `8° W` 자기편차를 더해 magnetic bearing으로 표시한다.

측정선은 지도 좌표계에 종속된다. zoom/pan 시 선 길이와 위치는 지도와 함께 움직이고, label 글자 크기는 fix label과 동일하게 zoom counter-scale을 적용한다.

## DIRECT TO FIX Interaction

선택된 항공기가 있을 때 fix를 좌클릭하면 해당 항공기에 `DIRECT TO FIX`를 부여한다.

적용 기준:

- direct 가능 fix는 주요 fix, entry/exit fix, approach reference, handoff reference, RWY 07 STAR/SID fix다.
- 오입력을 막기 위해 DIRECT TO는 넓은 원형 hitbox가 아니라 실제 보이는 fix label 또는 fix symbol 주변의 정밀 hitbox를 클릭할 때만 수행한다.
- 선택된 fix는 노란색 계열로 highlight한다.
- 항공기 `route_mode`는 `direct`로 바뀌고 `next_fix`에 fix ID를 저장한다.
- scratchpad에는 fix 전체 이름이 아니라 direct token만 병합한다. 일반 fix는 3글자 token을 쓴다. 예: `LIMSO -> LIM`, `YUMIN -> YUM`.
- `PC` 뒤에 숫자가 붙은 fix는 `PC`를 빼고 숫자만 쓴다. 예: `PC726 -> 726`, `PC811 -> 811`, `PC841 -> 841`.
- 기존 scratchpad가 비어 있으면 direct token만 표시한다. 예: `LIM`.
- 기존 scratchpad가 있으면 기존 text를 보존하고 direct token을 뒤에 붙인다. 예: `22.22 LIM`.
- 표시 heading은 자북 기준이다. 내부 이동 계산은 true heading으로 저장하고, 화면 입력/표시는 현재 RKPC 자기편차 `8° W`를 반영해 magnetic heading으로 변환한다.
- 레이더 갱신 주기인 3초마다 현재 항공기 위치에서 대상 fix까지의 bearing을 다시 계산한다.
- 항공기는 현재 groundspeed 기준으로 3초 동안 이동 가능한 거리만큼 fix 방향으로 움직인다.
- fix 도달 판정은 `max(0.25 NM, 3초 이동거리)` 안에 들어오면 도달로 본다.
- 도달 시 항공기는 fix 좌표에 snap되고 `route_mode`는 `vector`로 복귀하며 `next_fix`는 비운다.
- HDG 명령을 새로 적용하면 기존 DIRECT는 취소되고 `vector` 모드로 전환한다. TEXT 안에 자동 direct token이 있으면 그 token만 제거하고 나머지 text는 보존한다.
- SPD/ALT/VS/TEXT 명령은 DIRECT를 취소하지 않는다. DIRECT 중 speed, assigned altitude, vertical rate, scratchpad만 갱신하고 fix 유도는 유지한다.
- 데이터블록의 상승/하강 trend는 실제 `vertical_rate_fpm` 기준으로만 표시한다. 현재고도와 지시고도 차이만으로 `↑`/`↓`를 만들지 않는다.
- data block callsign 더블클릭 메뉴는 빠른 명령 팔레트다. 기본 버튼은 `HDG`, `SPD`, `ALT`, `VS`, 절차 버튼, `TEXT`, `CLR`이다.
- `HDG`, `SPD`, `ALT`, `VS`, `TEXT` 입력창에는 별도 OK 버튼을 두지 않는다. Enter는 적용, Esc는 취소다.
- `ALT` 빠른 입력창은 직접 입력과 preset dropdown을 같이 지원한다. preset 범위는 `1000`부터 `F320`까지 1000 ft 단위다.
- `ALT` preset dropdown 선택은 즉시 적용한다. `ALT` 직접 타이핑은 Enter를 눌러야 적용한다.
- 트래픽 생성/스트림 설정의 `ALT` 입력도 같은 UX를 쓴다. 기존 고도값은 placeholder로 보이고, 포커스 시 입력값을 비워 dropdown 전체가 열리게 한다. 선택하지 않고 빠져나오면 기존 저장값은 유지한다.
- STAR 자동 scratchpad token은 runway family로 표시한다. RWY07 STAR는 `P`, RWY25 STAR는 `M`이다.
- STAR VIA 상태는 `P VIA` 또는 `M VIA`로 표시하고, STAR CXL LVL 상태는 `P` 또는 `M`만 표시한다.
- STAR VIA token이 있어도 cleared altitude가 없으면 항공기는 고도제한 때문에 자동 하강하지 않는다. STAR VIA 상태에서 ALT를 별도로 입력해야 `descend via ... to ALT`로 해석한다.
- DIRECT TO FIX는 메뉴 버튼이 아니라 기존처럼 선택 항공기 상태에서 지도상의 FIX를 클릭해 수행한다.
- 항공기 삭제는 callsign 메뉴에 두지 않는다. 항공기를 선택한 뒤 키보드 `Delete`를 누르면 즉시 삭제한다. 단 입력창, 버튼, 패널, menu에 포커스가 있을 때는 키보드 Delete를 항공기 삭제로 처리하지 않는다.

DIRECT는 아직 STAR/SID 절차 수행이 아니다. 지금 단계에서는 단일 fix로 향하는 관제 지시만 구현한다.

## 구현 잠금 규칙

이 문서의 predictor line 규칙은 locked contract다.

변경하려면 먼저 이 문서를 수정하고, 그 다음 renderer / aircraft-state / scenario seed를 수정한다.

구현 우선순위:

1. 항공기 현재 위치는 원형 심볼로 표시한다.
2. predictor line은 `ground_speed_kt / 120 NM` 기준으로 계산한다.
3. predictor line 끝점은 실제 좌표 기반 30초 후 위치여야 한다.
4. screen pixel 고정 길이 predictor는 허용하지 않는다.
5. leader line은 predictor line과 별도 의미로 유지한다.
6. 데이터블록은 hover 시 반투명 박스로 grab 영역을 표시한다.
7. 데이터블록 drag는 aircraft position이 아니라 데이터블록 offset만 변경한다.
8. Measure / bearing line은 screen pixel 고정 좌표가 아니라 실제 위경도 시작점/끝점으로 저장한다.
9. Measure / bearing line의 bearing label은 magnetic heading 기준으로 표시한다.

## 현재 구현 메모

현재 화면은 원형 aircraft symbol, 데이터블록 표시, 3초 radar update loop를 갖고 있다.

항공기 위치는 매 animation frame이 아니라 3초 radar sweep 단위로 갱신한다.

각 radar tick은 시뮬레이션 시간 기준 3초 이동을 의미한다. 배속 버튼 `1x / 2x / 4x / 6x / 8x / 10x`는 한 번의 sweep 안에서 내부 substep을 여러 번 수행하는 기능이 아니라, 실제 tick 발생 주기를 줄이는 기능이다.

예시:

| 배속 | 실제 tick 주기 |
|---:|---:|
| `1x` | 3.0초 |
| `4x` | 0.75초 |
| `10x` | 0.3초 |

갱신 기준:

- `heading_true_deg`
- `ground_speed_kt`
- `vertical_rate_fpm`
- 갱신 간격 `3 sec`

위도/경도는 각 radar tick의 3초 동안 이동한 거리만큼 실제 좌표 기반 destination point로 갱신한다.

고도는 각 radar tick마다 `vertical_rate_fpm * 3 / 60`만큼 갱신하되, assigned altitude가 있으면 해당 지시고도를 지나치지 않는다.

predictor line은 현재 구현에서 30초 후 실제 좌표 기반 endpoint를 사용한다. screen pixel 고정 길이 방식은 사용하지 않는다.

Pause / Resume 버튼은 radar update loop만 멈춘다. 지도 pan/zoom, 데이터블록 drag, 레이어 표시는 계속 동작해야 한다.
