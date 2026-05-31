# Aircraft Datablock Spec

## 목적

이 문서는 제주 접근관제 시뮬레이터의 항공기 데이터블록 표시 규칙을 고정한다.

이 규칙은 `arrival`과 `departure` 항공기 데이터블록의 기준이며, 이후 항공기 이동 엔진, 관제 명령 UI, scratchpad 입력 UI는 이 문서를 기준으로 구현한다.

항공기 원형 심볼, leader line, 30초 predictor line은 `RADAR_SYMBOLOGY_SPEC.md`를 기준으로 한다.

## 적용 범위

- 접근/도착 항공기
- 출발 항공기
- 레이더 화면 항공기 심볼 옆 데이터블록
- 사용자가 직접 지시하는 heading, altitude, speed, scratchpad 표시

## 공통 구조

데이터블록은 총 4줄이다.

```text
CALLSIGN  SQUAWK  [W 공란]  OWNER
PRESENT_ALT  TREND  ASSIGNED_ALT  AIRPORT
GROUND_SPEED  AIRCRAFT_TYPE  [FREQ_STATUS]
SCRATCHPAD_TEXT
```

## 도착 항공기

도착 항공기의 `OWNER`는 `APP`로 표시한다.

도착 항공기의 `AIRPORT`는 도착공항이며, 제주 접근관제 시뮬레이터 기본값은 `RKPC`다.

```text
JJA117  7214     APP
A120    ↓ A080   RKPC
360     B738
YM
```

## 출발 항공기

출발 항공기의 `OWNER`는 `DEP`로 표시한다.

출발 항공기의 `AIRPORT`는 목적지 공항이다.

```text
KAL123  4231     DEP
A050    ↑ F180   RKSS
250     A321
DCT
```

## 1줄 규칙

```text
CALLSIGN  SQUAWK  [W 공란]  OWNER
```

| 필드 | 의미 | 예시 |
|---|---|---|
| `CALLSIGN` | 항공기 콜사인 | `JJA117` |
| `SQUAWK` | SSR code | `7214` |
| `W` | 현재는 공란 reserved column | 공란 |
| `OWNER` | 관제석 소유권 | `APP`, `DEP` |

`W` column은 실제 화면 구조를 맞추기 위한 reserved column이다. 현재 기능에서는 값 없이 공란으로 둔다.

## 콜사인 생성 규칙

수동 항공기 생성과 stream/wave 생성에서 `CALL=AUTO` 또는 공란을 사용하면 시스템이 콜사인을 자동 배정한다.

자동 배정 형식:

```text
KOREAN_AIRLINE_PREFIX + 3~4 digit number
```

예:

- `KAL123`
- `AAR4821`
- `JJA117`
- `JNA640`
- `TWB2215`

현재 내장 prefix pool:

```text
KAL, AAR, JJA, JNA, TWB, ESR, ABL, ASV, EOK
```

중복 콜사인은 같은 화면에 동시에 생성하지 않는다.

stream/wave의 `CALL` 필드에 `JJA`, `KAL`처럼 직접 prefix를 넣으면 랜덤 항공사 배정이 아니라 해당 prefix로 순번 콜사인을 생성한다.

## 2줄 규칙

```text
PRESENT_ALT  TREND  ASSIGNED_ALT  AIRPORT
```

| 필드 | 의미 | 예시 |
|---|---|---|
| `PRESENT_ALT` | 현재 고도 표시 | `A050`, `A120`, `F150` |
| `TREND` | 상승/하강/수평 표시 | `↑`, `↓`, 공란 |
| `ASSIGNED_ALT` | 지시 고도 표시 | `A080`, `F180` |
| `AIRPORT` | 도착기: 도착공항, 출발기: 목적지 공항 | `RKPC`, `RKSS` |

`TREND`는 현재고도 숫자에 붙이지 않는다. 반드시 별도 column으로 띄워 표시한다.

좋은 예:

```text
A120    ↓ A080   RKPC
```

나쁜 예:

```text
A120↓   A080     RKPC
```

## 고도 표시 규칙

내부 상태값은 항상 feet 단위 숫자로 저장한다.

레이더 데이터블록 표시만 아래 규칙을 따른다.

| 조건 | 표시 규칙 | 예시 |
|---|---|---|
| 14,000 ft 미만 | altitude 표시, `A` prefix 사용 | `A050`, `A080`, `A120` |
| 14,000 ft 이상 | Flight level 표시, `F` prefix 사용 | `F140`, `F180`, `F240` |

해석:

- `A050` = 5,000 ft
- `A080` = 8,000 ft
- `A120` = 12,000 ft
- `F140` = FL140
- `F180` = FL180

데이터블록 안에서는 `ft`, `feet`, `FL` 문자열을 직접 길게 쓰지 않는다. compact radar format에서는 `A080`, `F180`처럼 표시한다.

## 상승/하강 표시 규칙

`TREND`는 실제 수직이동 상태인 `vertical_rate_fpm` 기준으로만 정한다.

현재고도와 지시고도의 차이만으로 `TREND`를 만들면 안 된다. 예를 들어 ILS에서 현재 `A024`, 지시고도 `A040`인 항공기가 실제로 하강 중이면 `A024 ↓ A040`이 맞고, 수평 중이면 `A024   A040`처럼 공란이 맞다. 지시고도 `A040`이 현재고도보다 높다는 이유만으로 `↑`를 표시하면 안 된다.

| 조건 | 표시 |
|---|---|
| `vertical_rate_fpm > +100` | `↑` |
| `vertical_rate_fpm < -100` | `↓` |
| `-100 <= vertical_rate_fpm <= +100` 또는 불명 | 공란 |

표시는 현재고도 옆 별도 column이다.

## 3줄 규칙

```text
GROUND_SPEED  AIRCRAFT_TYPE  [FREQ_STATUS]
```

| 필드 | 의미 | 예시 |
|---|---|---|
| `GROUND_SPEED` | 현재 지상속도, kt 단위 숫자 | `250`, `360` |
| `AIRCRAFT_TYPE` | ICAO 기종 코드 | `B738`, `A321` |
| `FREQ_STATUS` | 주파수/첫 컨택 상태. 정상 on-frequency이면 공란 | `OFF`, `CALL`, `JAM`, `SBY` |

데이터블록 안에서는 `kt`를 붙이지 않는다.

`FREQ_STATUS` 표시 규칙:

| 표시 | 의미 |
|---|---|
| `OFF` | first-contact 대상이지만 아직 주파수에 올라오지 않음 |
| `CALL` | 조종사가 첫 컨택했고 관제 응답/리드백 절차가 진행 중 |
| `JAM` | 동시 송신으로 blocked transmission 발생 |
| `SBY` | 관제사가 해당 항공기에게 standby를 지시했고, 항공기는 주파수에 있으나 대기 중 |
| 공란 | 정상 on-frequency |

## 4줄 규칙

```text
SCRATCHPAD_TEXT
```

관제사가 직접 넣는 자유 text box다.

예시:

- `YM`
- `22.22`
- `22.22 LIM`
- `22.22 726`
- `ILS`
- `HOLD`

비어 있으면 공란으로 둔다.

`TEXT`는 8자 제한을 두지 않는다. 단, 레이더 화면 시인성을 위해 관제 약어 중심으로 짧게 유지한다.

관제 메모 예시:

- `22.22` = speed 220 / heading 220 지시 메모
- `18.27` = speed 180 / heading 270 지시 메모
- `22.22 LIM` = speed 220 / heading 220 메모와 LIMSO direct token 동시 표시
- `22.22 726` = speed 220 / heading 220 메모와 PC726 direct token 동시 표시
- ATC command parser가 만든 heading/speed token은 항상 `Hxx Sxx` 순서로 정렬한다. 예: heading 230 speed 180은 `H23 S18`, 기존 `S18`이 있고 heading 090만 새로 적용되어도 `H09 S18`로 표시한다.

데이터블록의 `CALLSIGN`을 왼쪽 버튼으로 더블클릭하면 해당 항공기를 선택하고 작은 text menu를 연다.

text menu:

- `Enter Text`: 작은 입력창을 열고 `TEXT` 값을 직접 입력한다.
- `Clear Text`: 해당 항공기의 `TEXT`만 비운다.
- RKPC 도착 APP 항공기: `STAR`, `ILS` 절차 버튼을 표시한다.
- DEP 항공기: `KAM`, `AKP`, `TAM`, `PAN`, `LIM` 출항 fix 버튼을 표시한다.
- DEP 버튼의 화면 표시는 3글자지만 내부 절차 매칭은 각각 `KAMIT`, `AKPON`, `TAMNA`, `PANSI`, `LIMDI`로 수행한다.
- 절차 버튼은 direct-to-fix로 절차 진입 fix를 지정한 뒤 사용한다. 이미 STAR/SID/ILS 수행 중이면 현재 active target fix를 기준으로 이어서 사용할 수 있다.
- APP `STAR`는 현재 direct target fix가 포함된 RWY 07 STAR를 자동 매칭한다.
- APP `ILS`는 현재 direct target fix가 `YUMIN -> LIMSO -> RW070` route 안에 있으면 해당 fix부터 ILS route를 시작한다.
- APP `ILS`에서 현재 direct target fix가 RWY 07 STAR route 안에 있고 그 STAR가 `YUMIN`으로 이어지면, STAR 남은 구간을 따라 `YUMIN`까지 간 뒤 `LIMSO -> RW070` ILS route를 이어서 수행한다.
- 예: `DAKPI` direct 상태에서 `ILS`를 누르면 `DAKPI -> PC628 -> PIMIK -> YUMIN -> LIMSO -> RW070` 순서로 수행한다.
- 예: `DAKPI`에서 `STAR` 수행 중 `ILS`를 누르면 현재 STAR active target fix부터 `YUMIN`까지 이어간 뒤 `LIMSO -> RW070`으로 전환한다.
- DEP 출항 fix 버튼은 해당 exit fix로 끝나는 SID를 선택하고, 현재 direct target fix가 그 SID route 안에 있을 때만 수행한다.
- 절차 지정 후에도 기존 direct fix token은 text에 남긴다. 예: `DAK ILS`, `YUM STAR`, `PAL SID`.

## Aircraft Control Panel

항공기 원형 심볼 또는 데이터블록을 선택하면 항공기 제어 패널을 열 수 있다.

패널은 레이더 지도 우측 하단에 고정한다. 데이터블록 drag와 충돌하지 않도록 지도 중심부에는 두지 않는다.

초기 지원 필드:

| 필드 | 의미 | 반영 대상 |
|---|---|---|
| `HDG` | 지시 magnetic heading | UI 입력은 자북, 내부 저장은 true 변환 후 `heading_true_deg`, `assigned.heading_true_deg` |
| `SPD` | 지시 speed | `ground_speed_kt`, `assigned.speed_kt` |
| `ALT` | 지시 altitude | `assigned.altitude_ft` |
| `VS` | vertical speed | `vertical_rate_fpm` |
| `TEXT` | scratchpad | `scratchpad` |

초기 구현에서는 `APPLY`를 누르거나 입력칸에서 `Enter`를 누르면 HDG/SPD는 즉시 현재 상태에 반영한다.

HDG는 관제 실무 기준에 맞춰 자북 기준으로 입력/표시한다. 제주 공항 기준 자기편차는 `RKPC AD 2.2`의 `8° W (2025) / 0.042° increasing` 값을 사용한다.

내부 좌표 이동 계산은 true heading이 필요하므로 아래 변환을 적용한다.

```text
true_heading = magnetic_heading - 8
magnetic_heading = true_heading + 8
```

자기편차 값은 공항 reference data의 `airport_meta.mag_var`에서 읽는다.

ALT는 현재 고도를 즉시 바꾸지 않는다. `assigned.altitude_ft`만 바꾸고, 실제 고도는 3초 radar update loop에서 `vertical_rate_fpm` 기준으로 이동한다.

입력 규칙:

- `HDG`: 자북 0-359 숫자
- `SPD`: 0-600 kt 숫자, 데이터블록에는 `kt`를 붙이지 않는다.
- `ALT`: `A080`, `F180`, `8000`, `080` 형식을 허용한다.
- `VS`: -6000~6000 fpm 숫자
- `TEXT`: 길이 제한 없이 입력하되, 저장 시 공백을 정리하고 대문자로 저장한다.

## Aircraft Delete

개별 항공기 삭제는 callsign 더블클릭 메뉴에서만 수행한다.

동작:

1. 데이터블록 callsign을 더블클릭한다.
2. `Delete ACFT`를 누르면 해당 항공기만 traffic list에서 즉시 제거한다.

선택 중인 항공기를 삭제하면 control panel 선택도 같이 해제한다.

이 기능은 항공기 하나를 실수로 만든 경우를 처리하기 위한 기능이다. stream 전체 삭제는 `TRAFFIC / STREAM`의 별도 삭제 버튼을 사용한다.

## Traffic Create Panel

`TRAFFIC` 패널은 항공기와 입출항 흐름을 화면에 생성하는 기능이다.

패널 내부는 세 가지 모드로 나뉜다.

- `FIX STAR`
- `MAP HDG`
- `STREAM`

입항 항공기 단건 생성은 `FIX STAR`, `MAP HDG` 두 가지 모드를 지원한다.

### FIX STAR

특정 FIX에 APP 항공기를 생성하고, 해당 FIX가 포함된 현재 활주로 STAR를 자동으로 수행하게 한다.

예:

- `FIX=DOTOL`이면 DOTOL 위치에서 생성 후 DOTOL 계열 STAR를 따른다.
- `FIX=BIROM`이면 BIROM이 포함된 STAR를 찾아 BIROM 이후 구간부터 진행한다.
- `FIX=DAKPI`이면 DAKPI가 포함된 STAR를 찾아 DAKPI 이후 구간부터 진행한다.

FIX가 현재 활주로 STAR route에 없으면 생성하지 않고 오류를 표시한다.

### DEP Runway Spawn

`POS=DEP`로 생성하는 출발 항공기는 FIX 위치가 아니라 현재 선택한 활주로 threshold에서 생성한다.

기본 동작:

- 생성 직후에는 활주로 방향으로 takeoff roll을 수행한다.
- roll 시작 상태는 현재고도 `A000`, 현재속도 `0 kt`다.
- departure end / 반대편 runway threshold 도달 시 `A010`, 최소 `180 kt` 상태로 SID를 탄다.
- 지시고도는 `A100`으로 고정한다.
- 지시속도는 10000 ft 이하 `250 kt`로 시작한다.
- 선택한 `EXIT`에 맞는 SID를 자동 수행한다.
- 10000 ft 초과 후 별도 SPD 지시가 없으면 자동 목표속도는 `300 kt`가 된다.

`HDG`, `SPD`, `ALT` 입력칸은 DEP 생성 시 초기 profile에 의해 고정된다. 생성 후 관제 패널에서 새 지시를 내리면 그 지시가 반영된다. 단, takeoff roll 중에는 runway roll이 SID guidance보다 우선한다.

### MAP HDG

관제사가 지도에서 직접 클릭한 위치에 APP 항공기를 생성한다.

동작:

1. `MAP HDG`를 선택한다.
2. `PICK MAP`을 누른다.
3. 지도에서 원하는 위치를 클릭한다.
4. `CREATE`를 누르면 해당 좌표에 APP 항공기를 생성한다.

`DCT FIX` 입력은 선택 사항이다.

- `DCT FIX`를 비우면 입력한 `HDG` 기준 vector 항공기로 생성한다.
- `DCT FIX`에 fix 이름을 넣으면 지도 클릭 위치에서 해당 fix로 direct 상태로 생성한다.
- direct 상태로 생성된 항공기는 데이터블록 text에 direct fix token을 남긴다.

MAP HDG 생성 항공기는 절차를 자동 수행하지 않는다.

생성 직후 상태:

- `route_mode = vector`
- heading은 생성 패널의 `HDG` 값을 사용한다.
- 이후 관제사가 control panel에서 HDG를 주거나, 항공기를 선택한 상태로 FIX를 클릭해 DCT를 줄 수 있다.

### STREAM

`STREAM`은 입항 stream과 출항 wave를 생성하는 모드다.

기준 동작은 `SCENARIO_STREAM_SPEC.md`를 따른다.

## 구현 잠금 규칙

이 문서의 데이터블록 구조는 locked contract다.

변경하려면 먼저 이 문서를 수정하고, 그 다음 UI/데이터 스키마/시나리오 seed를 수정한다.

구현 우선순위:

1. 데이터블록 4줄 구조
2. 도착기 `APP` / 출발기 `DEP`
3. 도착기 airport = 도착공항, 출발기 airport = 목적지 공항
4. 고도 표시 threshold 14,000 ft
5. 상승/하강 trend를 현재고도에서 띄워 표시
6. scratchpad text
7. 선택 항공기 제어 패널
