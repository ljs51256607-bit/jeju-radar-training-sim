# 제주 접근관제 시뮬레이터 좌표 권한 정책

## 1. 목적

이 문서는 이 프로젝트에서 `정확한 좌표 기반 구현`이 무엇을 뜻하는지 고정한다.

핵심은 단순하다.

- 화면이 비슷해 보이는 것과
- 좌표가 정확한 것은

전혀 다르다.

이 프로젝트는 앞으로 두 번째만 허용한다.

## 2. 절대 원칙

1. 이미지 파일은 수치 기준이 아니다.
2. 모든 핵심 객체는 `원문 좌표 문자열 + decimal latitude + decimal longitude + source_file + source_section`을 함께 가진다.
3. `draft`, `coarse`, `first_pass`, `visual_reference` 상태의 geometry는 `exact mode`에서 사용하지 않는다.
4. 좌표로 증명할 수 없는 선, polygon, label anchor는 임의로 추가하지 않는다.
5. UI는 데이터 위에 올라가는 렌더러일 뿐이고, source-of-truth가 아니다.

## 3. exact mode 정의

아래를 모두 만족할 때만 `exact mode`라고 부른다.

1. 공항 ARP, 활주로 threshold, navaid, fix가 공식 좌표로 검증됨
2. TMA airspace boundary의 모든 vertex가 좌표로 등록됨
3. MVA sector의 모든 polygon vertex가 좌표로 등록됨
4. videomap line / label anchor가 좌표 근거를 가짐
5. procedure leg가 fix 또는 명시 좌표로만 연결됨
6. validator가 blocking layer 0건으로 통과함

현재 상태:

- `data/` 기준 기존 authority chain은 `strict validator`를 통과했다.
- 그러나 기존 `data/geometry/tma_boundary.geojson`은 ATC surveillance/MVA chart 기반 외곽 reference에 가깝고, AIP ENR 2.1의 TMA 공역 polygon과 동일시하면 안 된다.
- `TMA airspace`는 `data/authority/rkpc_tma_airspace_register.csv`에서 `data/geometry/jeju_tma_airspace.geojson`으로 승격했다.
- renderer/UI는 aircraft operation prototype까지 진행됐지만, `정밀 데이터 완성`, `화면 완성`, `훈련 시뮬레이터 완성`은 서로 다른 말이다.

## 4. 레이어 권한 등급

| 등급 | 의미 |
|---|---|
| `coordinate_verified` | 공식 문서 좌표 또는 동일 수준의 근거로 검증 완료 |
| `derived_coordinate` | 공식 좌표에서 계산/유도되었고 계산 근거가 남아 있음 |
| `partial_reference` | 일부만 좌표 검증됨 |
| `visual_reference_only` | 화면 참고용, 수치 기준 불가 |
| `blocked_missing_source` | 원천 자료 또는 vertex 등록이 아직 없음 |

## 5. 레이더 화면에 대한 원칙

- 웹 기술은 사용할 수 있다.
- 하지만 `일반 웹페이지`처럼 만들면 안 된다.
- 목표는 `대시보드`가 아니라 `전용 레이더 렌더러`다.
- 따라서 앞으로의 우선순위는 `카드/패널 추가`가 아니라 `좌표 데이터 정밀화`다.

## 6. 현재 체크포인트

현재 상태를 냉정하게 분리하면 아래와 같다.

### 이미 꽤 좋은 것

- `data/reference/rkpc_airport.json`
- `data/reference/rkpc_procedures.json`
- `data/authority/rkpc_tma_airspace_register.csv`
- `data/geometry/jeju_tma_airspace.geojson`
- `data/authority/rkpc_terminal_fix_register.csv`
- `data/authority/rkpc_sid_star_route_register.csv`
- `data/reference/rkpc_reference_points.json`
- `data/reference/rkpc_chart_primitives.json`
- `data/geometry/mva_sectors.geojson`
- `data/geometry/coastline_lines.geojson`
- `data/authority/ats_route_register.json`
- `data/geometry/ats_routes.geojson`
- `data/authority/special_use_airspace_register.json`
- `data/geometry/special_use_airspace.geojson`
- `data/geometry/videomap_lines.geojson`
- `data/geometry/videomap_labels.json`

### 명칭을 조심해야 하는 것

- `data/geometry/tma_boundary.geojson`
  - 현재 의미: ATC surveillance/MVA chart 기반 reference boundary
  - 금지: AIP ENR 2.1의 Jeju TMA T23/T43 공역 boundary로 부르는 것

### 지금 남은 핵심 문제

- label collision과 density rule이 아직 조잡하다.
- scenario 저장/로드와 다중 항공기 stream 생성이 아직 없다.
- STAR/SID/ILS 고도/속도 제한은 아직 자동 적용하지 않는다.
- route progression 자동 검증이 더 필요하다.
- 기동 모델은 radar-level 기본형이며 실제 항공기 성능 모델은 아니다.

즉, `TMA airspace authority`와 주요 map authority 1차 승격은 끝났고, 다음 중심은 `scenario operation`, `route 검증`, `화면 가독성`이다.

## 7. 즉시 작업 순서

1. 현재 문서와 구현 상태를 일치시킨다.
2. `traffic_seed.json`을 확장할 scenario schema를 정리한다.
3. entry/exit fix 기반 stream 생성 기능을 만든다.
4. DCT / STAR / SID / ILS route progression 검증을 확대한다.
5. label collision과 density rule을 정리한다.

## 8. 구현 금지 사항

- 이미지 눈대중으로 polygon을 닫고 “정확”하다고 부르는 것
- label 위치를 감으로 옮기는 것
- coarse geometry를 production-like 기본값으로 쓰는 것
- UI 진척도를 데이터 진척도로 오해하는 것

## 9. 운영 규칙

- exact mode가 막혀 있으면 그 사실을 숨기지 않는다.
- 새 레이어를 추가할 때는 먼저 authority level을 적는다.
- validator를 통과하지 못하면 `정밀 구현 완료`라고 말하지 않는다.
- strict validator가 다시 깨지면 exact mode 주장은 즉시 철회한다.
