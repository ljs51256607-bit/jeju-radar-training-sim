# MVA Exact Boundary Spec

## 목적

이 문서는 제주 MVA sector를 `heuristic`이 아니라 AIP chart authority 기반 geometry로 고정하기 위한 기준이다.

## 현재 기준

2026-04-25 기준 MVA 화면 표시의 source-of-truth는 더 이상 수동 polygon spec가 아니다.

- 공식 원본: KOCA eAIP `RKPC AD CHART 2-20 ATC SURVEILLANCE MINIMUM ALTITUDE CHART - ICAO`
- 로컬 원본: `<private-source-redacted>`
- 공식 PDF SHA256: `4B435586B9AEB015819C93A30ED4054EC0855E9DE9B044E98D3FE35660FE9E35`
- 생성 스크립트: `scripts/extract_official_mva_chart_geometry.py`
- 화면 geometry: `data/geometry/mva_sectors.geojson`
- 추출 감사: `data/authority/mva_pdf_vector_extraction_audit.json`

현재 앱에 올리는 MVA는 PDF 내부 벡터 stroke를 직접 추출한 linework와 PDF text bbox에서 추출한 altitude label이다.

## 수동 spec 상태

아래의 수동 sector spec는 보존하지만, 현재 화면 표시용 authority에서는 제외한다. 이유는 실제 AIP chart와 비교했을 때 누락 sector와 곡선/방사선 형태 왜곡이 확인되었기 때문이다.

남은 역할:

- 이후 point-in-sector 판정용 polygonization을 만들 때 참고 자료로만 사용한다.
- 화면 표시에는 사용하지 않는다.

기존 핵심 원칙은 다음 수동 spec에만 적용된다.

핵심 원칙:

1. `arc`는 모두 `RADAR_SITE` 중심으로 정의한다.
2. `radial`은 chart annotated boundary로 본다.
3. `line`은 chart vertex를 직접 잇는 shared path 또는 straight boundary다.
4. sector geometry는 `data/authority/mva_boundary_spec.json`만을 source-of-truth로 사용한다.

## 공통 기준

- radar origin: `33°30'03.4"N 126°28'59.8"E`
- source note: MVA chart NOTE 2
- bearing note: chart에는 `BRG ARE MAG`가 표시되어 있으나, 실제 렌더링 geometry는 certified coordinate anchor를 연결해 생성한다.
- explicit segment kinds:
  - `arc`
  - `radial`
  - `line`

## sector 요약

- `MVA_FINAL_07_CORE_2000`
  - `12NM arc -> line -> line -> line`
- `MVA_FINAL_25_EAST_3300`
  - `line -> radial(093) -> 45NM arc -> line`
- `MVA_MOUNTAIN_CORE_9000`
  - `radial(184) -> line -> 15NM arc -> 15NM arc -> radial(119) -> line`
- `MVA_NORTHWEST_SHOULDER_2200`
  - `line -> line -> radial(057) -> 12NM arc -> line`
- `MVA_NORTH_INBOUND_2700`
  - `line -> line -> 45NM arc -> line -> line`
- `MVA_NORTH_OUTER_4000`
  - `line -> line -> line -> line -> 45NM arc`
- `MVA_SOUTHEAST_INNER_4600`
  - `3NM arc -> line -> line -> radial(119) -> line -> line`
- `MVA_SOUTHEAST_MID_7500`
  - `line -> line -> line -> 45NM arc`
- `MVA_SOUTHEAST_OUTER_10000`
  - `radial(108) -> 60NM arc -> radial(119) -> 45NM arc`
- `MVA_SOUTHWEST_ESCAPE_5000`
  - `line -> radial(225) -> 17NM arc -> line -> line`
- `MVA_SOUTHWEST_OUTER_7000`
  - `radial(241) -> line -> line -> line`
- `MVA_SOUTHWEST_TRANSITION_4000`
  - `radial(241) -> 30NM arc -> line -> 35NM arc`
- `MVA_SOUTH_CENTER_OUTER_8000`
  - `40NM arc -> 40NM arc -> line -> line`
- `MVA_SOUTH_DEEP_12500`
  - `40NM arc -> 40NM arc -> radial(151) -> 45NM arc -> line`
- `MVA_WEST_INBOUND_2900`
  - `line -> line -> line -> line`

## 구현 규칙

- rebuild script는 더 이상 `same-ring`, `same-bearing` heuristic으로 segment kind를 추론하지 않는다.
- segment kind와 radius/direction은 `mva_boundary_spec.json`에 명시된 값만 사용한다.
- sector polygon 내부 label은 렌더링용 convenience 값일 뿐 authority anchor가 아니다.
