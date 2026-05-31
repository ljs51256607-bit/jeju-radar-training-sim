# Scenario Snapshot Spec

## 목적

이 문서는 제주 접근관제 시뮬레이터의 시나리오 저장/로드 v1 규칙을 고정한다.

현재 시나리오는 서버나 파일 DB가 아니라 브라우저 `localStorage`에 저장한다. 백업과 공유는 JSON export/import로 처리한다.

## 파일 export/import

앱의 `EXPORT` 버튼은 snapshot을 바로 파일 루트에 쓰지 않고 `scenario_export_v1` wrapper로 내보낸다.

파일 최상위에는 export schema, export time, 사람이 빠르게 확인할 수 있는 summary, 그리고 실제 snapshot이 들어간다.

```json
{
  "export_schema": "jeju_radar_scenario_export_v1",
  "exportedAt": "2026-05-27T00:00:00.000Z",
  "summary": {
    "name": "R07 high traffic radio flow",
    "runway": "07",
    "savedAt": "2026-05-27T00:00:00.000Z",
    "aircraftCount": 5,
    "arrivalStreamCount": 0,
    "departureWaveCount": 0
  },
  "snapshot": {}
}
```

IMPORT는 하위 호환을 위해 아래 세 형태를 모두 허용한다.

- v1 snapshot JSON
- `{ "snapshot": ... }` 형태의 saved-record wrapper
- `{ "export_schema": "jeju_radar_scenario_export_v1", "snapshot": ... }` 형태의 export wrapper

## 저장된 절차 진행 상태

시나리오 항공기는 단순 위치뿐 아니라 `route_mode`, `next_fix`, `procedure_route`, `procedure_route_index`, `procedure_kind` 같은 절차 진행 상태를 함께 저장한다.

`verify:scenario-route-progression`은 export/import/load를 통과한 STAR+ILS 항공기와 SID 항공기를 simulation tick으로 반복 진행시켜, 저장된 절차 상태가 runway threshold landing 또는 SID exit completion까지 이어지는지 검증한다.

`verify:scenario-stream-route-progression`은 arrival stream이 만든 여러 항공기를 동시에 진행시켜, 각 항공기의 STAR route queue와 `procedure_route_index`가 독립적으로 끝까지 유지되는지 검증한다.

## 내장 radio-flow rehearsal

`R07 high traffic radio flow` preset은 첫 컨택 radio 흐름을 고정 재현하는 내장 시나리오다.

내장 preset은 flow metadata를 가진다. 현재 radio-flow preset은 `kind=radio`, `label=RADIO FLOW`, `trainingFocus=first_contact_jam_sequence`로 분류하고, SCEN panel은 hardcoded label 대신 이 metadata를 표시한다.

검증 명령 `verify:high-traffic-radio-rehearsal`은 아래 순서를 한 번에 확인한다.

- APP first-contact 항공기는 authority `DOTOL` 좌표 `34.254278, 126.610167` 기준으로 배치한다.
- APP 항공기 3대가 동시에 첫 컨택하면 jammed event가 발생한다.
- 관제사가 `calling station say again`을 주면 deterministic 순서의 첫 항공기만 원래 첫 컨택 문장을 반복한다.
- 관제사가 오래된 jam을 늦게 정리해도 남은 항공기들은 즉시 동시에 재호출하지 않고, 정리 시각 기준으로 다시 stagger된 retry 순서를 따른다.
- 아직 정리되지 않은 더 최신 jam이 있으면, 이전 jam에 남아 있던 항공기는 그 최신 jam 처리 순서 앞으로 끼어들지 못한다.
- 해당 항공기가 관제 응답/리드백 대기 상태이면 다른 항공기는 끼어들지 않는다.
- 관제사가 wrong callsign 뒤 `코랙션`으로 corrected callsign을 다시 말해도 corrected aircraft에 첫 컨택 응답과 HDG/SPD 지시를 적용한다.
- 저장 시나리오를 막 로드해 자동 first-contact call event가 아직 발생하지 않았더라도, `radar contact`가 포함된 controller reply는 해당 first-contact profile을 주파수 합류로 처리한다.
- `Jeju Approach radar contact heading 230 speed 180`은 첫 컨택 응답과 HDG/SPD 지시를 동시에 적용한다.
- HDG/SPD 지시 후 기존 route scratchpad token은 사라지고 `H23 S18`만 남는다.
- 남은 APP 항공기와 DEP 항공기가 같은 순간 다시 ready가 되면 2차 jam으로 묶고, 관제사가 지정한 순서대로 풀린 뒤 다음 항공기가 호출한다.

`verify:ui-rehearsal-hooks`는 브라우저 리허설에 필요한 SCEN preset load, ATC command input/submit, aircraft scratchpad selector가 실제 렌더링되는지 확인한다.

`verify:ui-high-traffic-rehearsal`은 production preview를 실제 브라우저로 열어 위 radio-flow preset을 로드한다. 브라우저에서는 `jam -> 누가 불렀어 -> JJA111 repeated first contact -> wrong-callsign 코랙션 포함 radar contact + heading/speed -> KAL222/AAR432 2차 jam -> AAR432 standby -> KAL222 say again -> KAL222 go ahead -> TWB333 final retry -> AAR432 go ahead` 순서를 확인한다. `JJA111` scratchpad는 `DOT`에서 `H23 S18`로 바뀌어야 하고, readback-only first-contact acknowledgement 뒤 입력칸은 비워져야 한다. FAST pilot speech 환경에서는 `/api/pilot-speech` proxy 요청이 없어야 한다.

Radio jam은 조종사 readback 문장이 아니다. `blocked transmission` 응답은 일반 TTS/LLM speech가 아니라 local WebAudio jam burst 대상으로 분류한다. 브라우저가 WebAudio를 막거나 headless 환경이면 jam playback은 local error 상태로 남기되, OpenAI speech proxy로 대체하지 않는다.

## 내장 missed-approach rehearsal

`R07 ILS missed approach flow` preset은 RWY 07 ILS Z final 항공기 1대를 복행 훈련 시작점으로 불러오는 내장 시나리오다.

이 preset은 `kind=missed_approach`, `label=MISSED APP`, `trainingFocus=ils_z_go_around_first_contact`로 분류한다. `MISSED APP` 확률은 100%로 arm 되어 있으므로, preset을 로드한 뒤 RESUME하면 final 5NM 조건의 항공기가 `MISSED_APPROACH_ILS_Z_RWY_07` profile로 전환된다.

검증 명령 `verify:scenario-presets`는 아래를 확인한다.

- preset 안의 final aircraft가 `ILS_Z_LOC_Z_RWY_07` final 상태로 시작한다.
- 자동 missed-approach candidate가 생성되고, 적용 후 `PC404 -> PETAA` missed route와 `MA` scratchpad가 잡힌다.
- missed aircraft는 바로 APP 주파수에 들어온 것으로 처리하지 않고 `MISSED_APP` first-contact flow로 넘긴다.
- 고도 1200ft 이상에서 조종사 첫 컨택 문장에 `missed approach`가 포함된다.
- 같은 runway departure wave 1개를 함께 두어 missed-approach 발생 시 출항 release retime 훈련을 이어갈 수 있다.

## 내장 handoff rehearsal

`R07 handoff contact flow` preset은 arrival tower handoff와 departure APP contact를 한 화면에 올리는 내장 시나리오다.

이 preset은 `kind=handoff`, `label=HANDOFF`, `trainingFocus=app_twr_dep_contact_sequence`로 분류한다. APP arrival `JJA207`은 LIMSO handoff reference에 위치하고 scratchpad `TWR`로 tower transfer target을 표시한다. DEP `KAL432`는 RWY07 departure end 이후 APP/DC contact candidate로 시작하며, RESUME 후 단독 first-contact call을 낼 수 있다.

검증 명령 `verify:scenario-presets`는 아래를 확인한다.

- preset dataset이 `ARR_07_LIMSO_HANDOFF`와 `DEP_TWR_TO_APP_0_5NM` handoff rule을 포함한다.
- arrival aircraft는 LIMSO reference, APP frequency 상태, scratchpad `TWR`로 시작한다.
- departure aircraft는 `DEP` first-contact candidate로 시작하고, 자동 평가 시 `Jeju Departure` 첫 컨택 문장을 생성한다.

## 내장 visual-approach rehearsal

`R07 visual approach flow` preset은 RWY 07 visual approach 조건 판단과 sequencing을 훈련하는 내장 시나리오다.

이 preset은 `kind=visual_approach`, `label=VISUAL APP`, `trainingFocus=rwy07_visual_approach_condition_gate`로 분류한다. target arrival `JJA307`은 APP 주파수에 있는 vector 상태로 시작하고 scratchpad `VIS`를 표시한다. `ABL549`는 같은 RWY07 final sequence traffic으로 `SEQ` scratchpad를 표시한다.

검증 명령 `verify:scenario-presets`는 아래를 확인한다.

- preset dataset이 `VISUAL_APPROACH_AIP_GENERAL` visual condition gate와 `RWY07_VISUAL_NOISE_ABATEMENT` final alignment restriction을 포함한다.
- target arrival는 vector mode, APP frequency 상태, scratchpad `VIS`, speed 180으로 시작한다.
- sequence traffic은 별도 항공기로 존재하고 scratchpad `SEQ`로 구분된다.

이 preset은 visual approach 판단과 sequencing을 위한 시작점이다. `CLEARED VISUAL APPROACH RUNWAY/RWY 07` clearance는 별도 runtime에서 인식되며, 항공기가 아직 final course에 안정적으로 정렬되지 않았으면 route mode는 vector로 유지하고 APP/final marker와 `VIS` scratchpad만 설정한다. 항공기가 runway final course 근처에 있고 threshold까지 적정 거리 안에 있으면 v1 runtime은 `LIMSO -> RW070` 같은 final route만 capture한다. base-to-final vectoring이나 visual circuit 자동화는 아직 만들지 않는다.

## 저장 단위

v1은 `snapshot` 방식이다.

즉, 시나리오를 만드는 recipe만 저장하는 것이 아니라 현재 레이더 화면의 항공기 상태와 절차 진행 상태를 그대로 저장한다.

## 저장 포함 항목

- `version`
- `id`
- `name`
- `savedAt`
- `runway`
- radar state
- aircraft state
- traffic stream/wave state
- weather placeholder

## 저장 제외 항목

- 선택된 항공기
- 열린 패널
- hover 상태
- snap cursor 상태
- 항공기 기준 측정선 / spacing line
- map zoom/pan

측정선은 관제사가 상황 중 임시로 긋는 작업선이다. 시나리오 원본에 저장하지 않는다.

## v1 JSON 구조

```json
{
  "version": 1,
  "id": "scenario-...",
  "name": "RWY07_DOTOL_STREAM",
  "savedAt": "2026-05-05T00:00:00.000Z",
  "runway": "07",
  "radar": {
    "paused": true,
    "surfaceMode": "exact",
    "densityMode": "balanced",
    "scopeExtentMode": "tma",
    "overlays": {},
    "showChrome": false,
    "simulationSpeed": 1
  },
  "aircraft": [],
  "traffic": {
    "scenarioForm": {
      "arrivalFix": "DOTOL",
      "departure07": {},
      "departure25": {},
      "departure31": {}
    },
    "activeArrivalStreams": [],
    "activeDepartureWaves": [
      {
        "departureRunway": "25",
        "exitFix": "KAMIT"
      }
    ]
  },
  "weather": null
}
```

## 시간값 처리

`scopeExtentMode`는 신규 저장 시 항상 `"tma"`로 기록한다.
예전 저장 파일에 `"wide"`가 남아 있어도 import/load는 허용하지만, 별도 WIDE 화면 모드로 전환하지 않는다.

항공기 명령 delay와 departure wave timer는 absolute timestamp를 사용한다.

따라서 load 시점에는 `now - savedAt` 만큼 관련 timestamp를 재보정한다. 예를 들어 저장 당시 명령 실행까지 5초 남았다면, 나중에 불러와도 약 5초 뒤에 실행된다.

## 레이더 배속 처리

`radar.simulationSpeed`는 시뮬레이션 시간 진행 배속이다.

허용값:

- `1`
- `2`
- `4`
- `6`
- `8`
- `10`

각 radar tick은 항상 시뮬레이션 시간 `3초` 이동을 의미한다. 배속은 한 번의 tick 안에서 시간을 몰아서 진행하는 것이 아니라, 실제 tick 발생 주기 자체를 줄인다.

| 배속 | 실제 tick 주기 | tick 1회당 시뮬레이션 시간 |
|---:|---:|---:|
| `1x` | 3.0초 | 3초 |
| `2x` | 1.5초 | 3초 |
| `4x` | 0.75초 | 3초 |
| `6x` | 0.5초 | 3초 |
| `8x` | 0.375초 | 3초 |
| `10x` | 0.3초 | 3초 |

명령 delay, arrival stream 보충, departure wave timer는 모두 이 simulation time을 기준으로 동작한다. 예를 들어 명령 delay가 10초이고 배속이 `4x`라면 실제 시간으로는 약 3초 뒤, `10x`라면 약 1.2초 뒤에 기동이 시작될 수 있다. 정확히 10초가 아니라 tick 경계에서 실행되므로 12초 simulation time에 잡히는 경우가 정상이다.

저장 파일에 `simulationSpeed`가 없으면 v1 호환을 위해 `1`로 읽는다.

## 출항 wave 호환

신규 저장 파일은 `scenarioForm.departure07`, `scenarioForm.departure25`, `scenarioForm.departure31`을 사용한다.
`activeDepartureWaves`에는 `departureRunway`를 저장한다.

예전 저장 파일의 단일 `departureExitFix`, `departureIntervalMin`, `departureCount` 형식은 로딩 시 현재 runway mode에 맞춰 `departure07` 또는 `departure25`로 변환한다.
`departureRunway`가 없는 예전 active wave는 `runway` 값을 기준으로 `07` 또는 `25`로 보정한다.

## 항공기 직접 생성 호환

개별 DEP 항공기는 `AircraftState.departure_runway`를 저장한다.

RWY 25+31 모드에서 직접 생성한 출발기는 화면 모드 `runway=25`와 별개로 실제 출발 활주로 `departure_runway=25` 또는 `departure_runway=31`을 가진다.

## 기상 확장

현재 `weather`는 `null`로 둔다.

추후 확장 순서:

1. 전역 바람 방향/속도
2. 고도별 wind layer
3. 비구름 polygon/raster overlay
4. weather avoidance scenario
