# TMA / Reference Boundary Display Validation

## Bottom Line

현재 primary TMA 공역 boundary는 `data/geometry/jeju_tma_airspace.geojson`이다.
이 파일은 AIP ENR 2.1의 Jeju TMA T23/T43 좌표 register에서 생성한다.

기존 `data/geometry/tma_boundary.geojson`은
`제주 ATC SURVEILLANCE MINIMUM ALTITUDE CHART.pdf`에 인쇄된 7개 vertex와 일치하지만,
이제 primary TMA 공역 boundary로 부르면 안 된다. 이 파일은 surveillance/MVA chart reference boundary다.

이번 검증에서는 두 가지를 확인했다.

1. 좌표 원전 검증
2. 현재 앱 투영이 모양을 얼마나 바꾸는지 수치 검증

## Primary TMA Source Of Truth

- 좌표 register: `data/authority/rkpc_tma_airspace_register.csv`
- 생성 결과: `data/geometry/jeju_tma_airspace.geojson`
- 공식 source: AIP ENR 2.1 Jeju Terminal Control Area T23/T43
- 생성 스크립트: `scripts/rebuild_tma_airspace_geometry.py`

## Surveillance Reference Boundary

- 좌표 register: `data/authority/tma_boundary_vertices.csv`
- 생성 결과: `data/geometry/tma_boundary.geojson`
- 공식 차트: `<private-source-redacted>`
- 검증 스크립트: `scripts/validate_tma_display.py`
- 검증 산출물:
  - `tmp/tma_validation/tma_display_validation.png`
  - `tmp/tma_validation/tma_display_validation_metrics.json`

## What Was Verified

`data/authority/tma_boundary_vertices.csv`의 7개 꼭짓점은 아래 chart printed vertex와 일치한다.
다만 이 검증은 old reference boundary에 대한 것이고, ENR 2.1 TMA airspace의 T23/T43 검증을 대체하지 않는다.

- `TMA_VTX_001` `34°14'26"N 126°19'37"E`
- `TMA_VTX_002` `34°11'03"N 127°21'41"E`
- `TMA_VTX_003` `33°33'59"N 127°22'38"E`
- `TMA_VTX_004` `33°16'10"N 127°20'07"E`
- `TMA_VTX_005` `32°59'22"N 127°08'18"E`
- `TMA_VTX_006` `32°56'41"N 126°02'37"E`
- `TMA_VTX_007` `33°12'49"N 125°52'37"E`

검증 그림에서도 공식 차트 crop의 7각 외곽과 우측 좌표 기반 plot의 7각 외곽이 같은 윤곽을 보인다.

## Numeric Result

`tmp/tma_validation/tma_display_validation_metrics.json` 기준:

- vertex count: `7`
- perimeter: `264.97 NM`
- area: `16,227.36 sq km`
- current app projection vs local equal-area reference
  - max normalized vertex delta: `0.47%`
  - max edge ratio delta: `0.91%`

이 수치는 중요하다.
현재 앱의 단순 투영이 `TMA shape 자체를 크게 틀리게 만들지는 않는다`는 뜻이다.
즉, 사용자가 느낀 위화감의 주원인은 `좌표 오류`보다 `화면 fit 방식`에 더 가까웠다.

## Renderer Correction

기존 `jeju-radar-ui/src/components/RadarMap.tsx`는 projector를 만들 때
`visibleLabels`와 `aircraft`까지 같이 넣고 있었다.
그래서 항공기 위치나 표시 레이어가 바뀔 때 scope fitting 기준도 같이 흔들렸다.

이번에 이 부분을 고쳤다.

- projector는 이제 공식 MVA chart frame의 graticule extent를 기준으로 만든다.
- 항공기와 label은 더 이상 scope fitting 기준에 참여하지 않는다.
- 임의 픽셀 grid는 제거하고 공식 chart frame의 `10분` 간격 위경도 graticule을 렌더링한다.

즉, 이제는 `좌표가 맞는데 화면이 움직여서 틀려 보이는 문제`를 줄였다.

## Cold Assessment

현재 상태는 이렇게 평가하는 게 맞다.

- `TMA airspace 좌표`: ENR 2.1 T23/T43 register에서 geojson으로 승격 완료
- `surveillance/MVA reference boundary`: chart printed vertex와 1차 검증 완료
- `사진과 똑같은 인상`: 아직 아님

마지막 항목이 아직 남아 있는 이유는,
실제 레이더 사진은 카메라 원근, 화면 비율, scope styling, grid/mva/label density의 영향을 함께 받기 때문이다.

즉 다음에 해야 할 일은 `TMA 좌표 재작업`이 아니라 아래다.

1. 실제 레이더 사진에 가까운 색/선굵기/declutter를 조정
2. label collision과 density rule을 정교화
3. official chart crop과 앱 스크린샷을 나란히 놓고 visual parity pass를 반복
