import AltitudePresetInput from "./AltitudePresetInput";
import TrafficModeTabs from "./TrafficModeTabs";
import { normalizeFixId, type AircraftCreateForm, type MapSpawnPoint } from "../lib/scenarioTraffic";
import type { TrafficPanelMode } from "../lib/trafficPanelMode";
import type { DepartureRunway, ScenarioFixRoleRecord } from "../lib/types";

interface AircraftCreatePanelProps {
  aircraftCreateDepartureFixes: ScenarioFixRoleRecord[];
  aircraftCreateDepartureRunway: DepartureRunway;
  aircraftCreateError: string | null;
  aircraftCreateExitFix: string;
  aircraftCreateForm: AircraftCreateForm;
  aircraftMapSpawnPoint: MapSpawnPoint | null;
  departureRunwaysForPanel: DepartureRunway[];
  mapSpawnPickActive: boolean;
  onClose: () => void;
  onCreateAircraft: () => void;
  onFormChange: <K extends keyof AircraftCreateForm>(
    field: K,
    value: AircraftCreateForm[K]
  ) => void;
  onTrafficModeChange: (mode: TrafficPanelMode) => void;
  onToggleMapSpawnPick: () => void;
  spawnFixes: Array<{ id: string }>;
  trafficPanelMode: TrafficPanelMode;
}

export default function AircraftCreatePanel({
  aircraftCreateDepartureFixes,
  aircraftCreateDepartureRunway,
  aircraftCreateError,
  aircraftCreateExitFix,
  aircraftCreateForm,
  aircraftMapSpawnPoint,
  departureRunwaysForPanel,
  mapSpawnPickActive,
  onClose,
  onCreateAircraft,
  onFormChange,
  onTrafficModeChange,
  onToggleMapSpawnPick,
  spawnFixes,
  trafficPanelMode
}: AircraftCreatePanelProps) {
  return (
    <form
      className="aircraft-create-panel"
      aria-label="Aircraft create panel"
      onSubmit={(event) => {
        event.preventDefault();
        onCreateAircraft();
      }}
    >
      <div className="aircraft-control-header">
        <div>
          <span>TRAFFIC GENERATOR</span>
          <strong>{trafficPanelMode === "map" ? "MAP POSITION SPAWN" : "FIX BASED STAR SPAWN"}</strong>
        </div>
        <button
          className="aircraft-control-close"
          onClick={onClose}
          type="button"
        >
          X
        </button>
      </div>

      <TrafficModeTabs activeMode={trafficPanelMode} onModeChange={onTrafficModeChange} />

      <div className="aircraft-create-grid">
        <label>
          CALL
          <input
            placeholder="AUTO or KAL123"
            title="AUTO 또는 공란은 한국 항공사 콜사인을 랜덤 배정한다. 직접 입력하면 그 값을 사용한다."
            value={aircraftCreateForm.callsign}
            onChange={(event) => onFormChange("callsign", event.target.value)}
          />
        </label>
        <label>
          TYPE
          <input
            value={aircraftCreateForm.aircraftType}
            onChange={(event) => onFormChange("aircraftType", event.target.value)}
          />
        </label>
        <label>
          POS
          <select
            value={aircraftCreateForm.phase}
            onChange={(event) =>
              onFormChange("phase", event.target.value as AircraftCreateForm["phase"])
            }
          >
            <option value="arrival">APP</option>
            <option value="departure">DEP</option>
          </select>
        </label>
        <label>
          {aircraftCreateForm.phase === "departure"
            ? "RWY"
            : aircraftCreateForm.spawnMode === "map"
              ? "DCT FIX"
              : "FIX"}
          {aircraftCreateForm.phase === "departure" ? (
            <select
              value={aircraftCreateDepartureRunway}
              onChange={(event) =>
                onFormChange("departureRunway", event.target.value as DepartureRunway)
              }
            >
              {departureRunwaysForPanel.map((runway) => (
                <option key={runway} value={runway}>
                  {runway}
                </option>
              ))}
            </select>
          ) : (
            <input
              list="aircraft-create-fixes"
              placeholder={aircraftCreateForm.spawnMode === "map" ? "optional" : undefined}
              value={aircraftCreateForm.positionFix}
              onChange={(event) => onFormChange("positionFix", normalizeFixId(event.target.value))}
            />
          )}
        </label>
        <label>
          HDG
          <input
            inputMode="numeric"
            disabled={aircraftCreateForm.phase === "departure"}
            value={aircraftCreateForm.heading}
            onChange={(event) => onFormChange("heading", event.target.value)}
          />
        </label>
        <label>
          SPD
          <input
            inputMode="numeric"
            disabled={aircraftCreateForm.phase === "departure"}
            value={aircraftCreateForm.speed}
            onChange={(event) => onFormChange("speed", event.target.value)}
          />
        </label>
        <label>
          ALT
          <AltitudePresetInput
            disabled={aircraftCreateForm.phase === "departure"}
            value={aircraftCreateForm.altitude}
            onChange={(value) => onFormChange("altitude", value)}
          />
        </label>
        <label>
          VS
          <input
            inputMode="numeric"
            value={aircraftCreateForm.verticalRate}
            onChange={(event) => onFormChange("verticalRate", event.target.value)}
          />
        </label>
        <label>
          SQWK
          <input
            inputMode="numeric"
            value={aircraftCreateForm.squawk}
            onChange={(event) => onFormChange("squawk", event.target.value)}
          />
        </label>
        {aircraftCreateForm.phase === "arrival" ? (
          <label>
            ARR
            <input
              value={aircraftCreateForm.arrivalAirport}
              onChange={(event) => onFormChange("arrivalAirport", event.target.value.toUpperCase())}
            />
          </label>
        ) : (
          <label>
            DEST
            <input
              value={aircraftCreateForm.destinationAirport}
              onChange={(event) => onFormChange("destinationAirport", event.target.value.toUpperCase())}
            />
          </label>
        )}
      </div>

      {aircraftCreateForm.spawnMode === "map" ? (
        <>
          <div className="aircraft-map-pick-row">
            <button
              className={mapSpawnPickActive ? "active" : ""}
              onClick={onToggleMapSpawnPick}
              type="button"
            >
              {mapSpawnPickActive ? "CLICK MAP" : "PICK MAP"}
            </button>
            <span>
              {aircraftMapSpawnPoint
                ? `${aircraftMapSpawnPoint.latitude.toFixed(4)} / ${aircraftMapSpawnPoint.longitude.toFixed(4)}`
                : "NO MAP POINT"}
            </span>
          </div>
          <div className="aircraft-create-hint">
            DCT FIX를 비우면 HDG vector, 입력하면 생성 즉시 해당 FIX로 direct.
          </div>
        </>
      ) : (
        <div className="aircraft-create-hint">
          {aircraftCreateForm.phase === "departure"
            ? "DEP 생성은 RWY roll 후 A010/180KT에서 SID를 타고 A100까지 상승한다."
            : "APP FIX 생성은 FIX를 입력하거나 지도 FIX를 클릭하면 해당 FIX부터 RWY STAR를 자동 수행한다."}
        </div>
      )}

      {aircraftCreateForm.phase === "departure" ? (
        <label className="aircraft-create-wide">
          EXIT
          <select
            value={aircraftCreateExitFix}
            onChange={(event) => onFormChange("exitFix", event.target.value)}
          >
            {aircraftCreateDepartureFixes.map((fix) => (
              <option key={fix.fix_id} value={fix.fix_id}>
                {fix.fix_id}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="aircraft-create-wide">
        TEXT
        <input
          value={aircraftCreateForm.scratchpad}
          onChange={(event) => onFormChange("scratchpad", event.target.value)}
        />
      </label>

      <datalist id="aircraft-create-fixes">
        {spawnFixes.map((fix, index) => (
          <option key={`${fix.id}-${index}`} value={fix.id} />
        ))}
      </datalist>

      {aircraftCreateError ? (
        <div className="aircraft-control-error">{aircraftCreateError}</div>
      ) : null}

      <button className="aircraft-control-apply" type="submit">
        CREATE
      </button>
    </form>
  );
}
