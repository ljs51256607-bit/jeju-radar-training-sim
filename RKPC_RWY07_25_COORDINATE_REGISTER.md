# RKPC RWY 07/25 좌표 Register

## 핵심 결론

이 문서는 서로 섞으면 안 되는 세 가지를 분리한다.

1. AIP ENR 2.1에 있는 TMA 공역 polygon vertex.
2. 좌표가 명시된 STAR/SID named fix.
3. navaid 좌표에서 계산해야 하는 conventional SID radial/DME/arc segment.

## 생성 산출물

- `data/authority/rkpc_tma_airspace_register.csv`
- `data/geometry/jeju_tma_airspace.geojson`
- `data/authority/rkpc_terminal_fix_register.csv`
- `data/authority/rkpc_sid_star_route_register.csv`

## 현재 수량

| 항목 | 수량 |
|---|---:|
| RWY 07/25 SID/STAR route row | 31 |
| fix sequence가 좌표로 모두 커버되는 route | 23 |
| 공식 source 충돌로 보류 중인 route | 0 |
| radial/DME 계산 geometry가 필요한 conventional route | 6 |
| fix sequence가 없는 radar-vector departure | 2 |
| register에 들어간 unique fix/support point | 71 |

## PC726 상태

결론: `PC726`은 현재 공식 KOCA eAIP STAR 기준으로 유지한다.

근거: KOCA eAIP의 RKPC AD 2.24 chart list가 STAR를 `RKPC AD CHART 2-18`로 연결하고, 해당 STAR PDF(21 AUG 2025)의 `RNAV DOTOL 2P` general information 및 coding table 모두 `PC726`을 포함한다. 따라서 `PC726`은 `coordinate_verified`로 확정하고 simulator-active exact route에 포함한다.

## Source authority

| 데이터 | 기준 source |
|---|---|
| TMA T23/T43 vertex | Official eAIP ENR 2.1 |
| named enroute significant point | Official eAIP ENR 4.4 및 procedure chart coding table |
| RWY 07/25 runway/navaid support | RKPC AD 2.12 및 AD 2.19 |
| RNAV STAR/SID route sequence | RKPC STAR/SID coding table |
| conventional SID geometry | 현재는 chart text 기준. exact geometry는 radial/DME 계산 필요 |

## 공식 source URL

- ENR 2.1: https://aim.koca.go.kr/eaipPub/Package/2026-02-18-AIRAC/html/eAIP/KR-ENR-2.1-en-GB.html
- ENR 4.4: https://aim.koca.go.kr/eaipPub/Package/2026-02-18-AIRAC/html/eAIP/KR-ENR-4.4-en-GB.html
- RKPC AD page: https://aim.koca.go.kr/eaipPub/Package/2026-02-18-AIRAC/html/eAIP/KR-AD-2.RKPC-en-GB.html
- SID PDF: https://aim.koca.go.kr/eaipPub/Package/2025-08-21/pdf/AD/RKPC/%282-12%29%20SID.pdf
- STAR PDF: https://aim.koca.go.kr/eaipPub/Package/2026-02-05/pdf/AD/RKPC/%282-18%29%20STAR.pdf

## downstream 구현 상태

`rkpc_tma_airspace_register.csv`는 `data/geometry/jeju_tma_airspace.geojson`으로 승격한다. 이 polygon만 primary TMA로 렌더링해야 하며, 기존 `data/geometry/tma_boundary.geojson`은 surveillance/MVA reference boundary로만 사용한다.
