# Scenario Fix Role Spec

## 목적

이 문서는 시나리오 생성에서 사용할 `입항 fix`와 `출항 fix`의 의미를 고정한다.

항공기 생성/시나리오 preset은 이 정의를 기준으로 arrival stream과 departure stream을 만든다.

## 기본 정의

### STAR entry fix

`STAR entry fix`는 RNAV STAR route의 첫 번째 named fix다.

예:

- `RNAV DOTOL 2P`: `DOTOL`
- `RNAV UPGOS 1P`: `UPGOS`
- `RNAV LIMDI 1P`: `LIMDI`

시나리오에서는 도착 항공기를 이 fix 바깥 또는 이 fix 근처에서 생성하고, 이후 STAR를 태우는 기준점으로 사용한다.

### SID exit fix

`SID exit fix`는 RNAV SID route의 첫 번째 fix가 아니다.

출항 fix는 SID가 TMA를 빠져나가 항로로 붙는 마지막 주요 outbound fix다.

예:

- `RNAV KAMIT 2E`: route는 `PC811 -> OLLEH -> KAMIT`, exit fix는 `KAMIT`
- `RNAV AKPON 1E`: route는 `PALRI -> AKPON`, exit fix는 `AKPON`
- `RNAV LIMDI 1W`: route는 `MEXER -> LEDIN -> LIMDI`, exit fix는 `LIMDI`
- `RNAV KAMIT 2N`: route는 `PC861 -> PC871 -> PC872 -> TOREN -> OLLEH -> KAMIT`, exit fix는 `KAMIT`
- `RNAV AKPON 1N`: route는 `PC861 -> PC871 -> PC872 -> TOREN -> PC874 -> AKPON`, exit fix는 `AKPON`

시나리오에서는 출발 항공기의 목적 방향과 SID 선택 기준으로 사용한다.

RWY31 SID는 독립 runway mode가 아니다. 현재 simulator에서는 `RWY25+31` 모드에서 RWY25 SID와 함께 표시/사용한다.

`KAMIT`와 `AKPON`은 RWY25와 RWY31이 같이 쓰는 공통 출항 fix다. UI나 role register에서 `KAMIT25 / KAMIT31`처럼 fix 자체를 나누지 않는다. 하나의 `KAMIT`, 하나의 `AKPON`으로 유지하고, 실제로 어느 SID를 탈지는 항공기의 physical runway 또는 planned SID가 결정한다.

### Conventional bidirectional gate

`IPDAS`와 `MAKET`은 재래식 항로 성격의 gate로 보고, 입항과 출항 모두 가능하게 둔다.

이 둘은 RNAV STAR entry fix와 같은 방식으로 절차가 바로 연결되는 것은 아니다. 시나리오 생성에서는 conventional inbound/outbound traffic gate로 사용하고, 세부 radial/DME 절차는 별도 단계에서 구현한다.

## 겹치는 fix

아래 fix는 입항과 출항 역할이 겹친다.

| Fix | 입항 기준 | 출항 기준 | 비고 |
|---|---|---|---|
| `LIMDI` | RNAV STAR entry | RNAV SID exit | RWY 07/25 양쪽 모두 사용 |
| `TAMNA` | RNAV STAR entry | RNAV SID exit | conventional/radar SID도 존재 |
| `IPDAS` | conventional gate | RNAV/conventional SID exit | 재래식 입항/출항 gate |
| `MAKET` | conventional gate | conventional SID exit | 재래식 입항/출항 gate |

이 네 fix는 `arrival` 또는 `departure` 하나로만 분류하면 안 된다. 데이터에서는 반드시 복수 role로 둔다.

## 현재 role register

기준 파일:

- `data/authority/rkpc_scenario_fix_role_register.json`

이 파일은 좌표 자체의 원천이 아니라, 이미 검증된 terminal fix register와 SID/STAR route register를 조합한 시나리오용 role register다.

## 사용 규칙

1. 도착기 stream 생성은 `scenario_roles`에 `arrival_entry`가 있는 fix만 사용한다.
2. 출발기 stream 생성은 `scenario_roles`에 `departure_exit`가 있는 fix만 사용한다.
3. `conventional_gate`가 있는 fix는 RNAV STAR/SID 자동 수행과 별도 처리한다.
4. 겹치는 fix는 UI에서 APP/DEP 문맥에 따라 다르게 보여준다.
5. SID의 첫 fix를 출항 fix라고 부르지 않는다. SID 첫 fix는 `sid_initial_fix`, SID 마지막 주요 outbound fix는 `sid_exit_fix`다.
6. RWY25+31 모드에서는 `runways`에 `25` 또는 `31`이 있으면 같은 mode에서 사용 가능하다고 본다.
7. KAMIT/AKPON처럼 RWY25 SID와 RWY31 SID가 같은 exit fix를 공유하는 경우, fix 버튼은 하나로 유지한다. 최종적으로는 aircraft 생성/시나리오 단계에서 physical runway 또는 planned SID를 명확히 가져야 한다.
