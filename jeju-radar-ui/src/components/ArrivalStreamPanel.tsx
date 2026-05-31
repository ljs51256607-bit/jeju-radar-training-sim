import AltitudePresetInput from "./AltitudePresetInput";
import type { ScenarioStreamForm } from "../lib/scenarioStorage";
import type { ScenarioFixRoleRecord } from "../lib/types";

interface ArrivalStreamPanelProps {
  arrivalStreamFixes: ScenarioFixRoleRecord[];
  onAddArrivalStreamAircraft: () => void;
  onClearArrivalStreams: () => void;
  onDeleteArrivalStreamAircraft: () => void;
  onFormChange: <K extends keyof ScenarioStreamForm>(
    field: K,
    value: ScenarioStreamForm[K]
  ) => void;
  onStartArrivalAutoKeep: () => void;
  scenarioForm: ScenarioStreamForm;
}

export default function ArrivalStreamPanel({
  arrivalStreamFixes,
  onAddArrivalStreamAircraft,
  onClearArrivalStreams,
  onDeleteArrivalStreamAircraft,
  onFormChange,
  onStartArrivalAutoKeep,
  scenarioForm
}: ArrivalStreamPanelProps) {
  return (
    <div className="scenario-stream-section">
      <div className="scenario-stream-title">
        <strong>ARR STREAM</strong>
        <span>NM spacing, auto STAR if available</span>
      </div>
      <div className="scenario-stream-grid">
        <label>
          ENTRY
          <select
            value={scenarioForm.arrivalFix}
            onChange={(event) => onFormChange("arrivalFix", event.target.value)}
          >
            {arrivalStreamFixes.map((fix) => (
              <option key={fix.fix_id} value={fix.fix_id}>
                {fix.fix_id}
              </option>
            ))}
          </select>
        </label>
        <label>
          SEP NM
          <input
            inputMode="decimal"
            value={scenarioForm.arrivalSpacingNm}
            onChange={(event) => onFormChange("arrivalSpacingNm", event.target.value)}
          />
        </label>
        <label>
          ADD
          <input
            inputMode="numeric"
            value={scenarioForm.arrivalAddCount}
            onChange={(event) => onFormChange("arrivalAddCount", event.target.value)}
          />
        </label>
        <label>
          KEEP
          <input
            inputMode="numeric"
            value={scenarioForm.arrivalKeepBuffer}
            onChange={(event) => onFormChange("arrivalKeepBuffer", event.target.value)}
          />
        </label>
        <label>
          ALT
          <AltitudePresetInput
            value={scenarioForm.arrivalAltitude}
            onChange={(value) => onFormChange("arrivalAltitude", value)}
          />
        </label>
        <label>
          SPD
          <input
            placeholder="AUTO"
            value={scenarioForm.arrivalSpeed}
            onChange={(event) => onFormChange("arrivalSpeed", event.target.value.toUpperCase())}
          />
        </label>
        <label>
          TYPE
          <input
            value={scenarioForm.arrivalAircraftType}
            onChange={(event) => onFormChange("arrivalAircraftType", event.target.value.toUpperCase())}
          />
        </label>
        <label>
          CALL
          <input
            placeholder="AUTO or JJA"
            title="AUTO는 한국 항공사 콜사인을 랜덤 배정하고, JJA/KAL처럼 입력하면 해당 prefix 순번을 사용한다."
            value={scenarioForm.arrivalCallsignPrefix}
            onChange={(event) => onFormChange("arrivalCallsignPrefix", event.target.value.toUpperCase())}
          />
        </label>
      </div>
      <div className="scenario-stream-actions four">
        <button className="aircraft-control-apply" onClick={onAddArrivalStreamAircraft} type="button">
          ADD ARR
        </button>
        <button className="scenario-stream-secondary" onClick={onStartArrivalAutoKeep} type="button">
          AUTO KEEP
        </button>
        <button className="scenario-stream-clear" onClick={onClearArrivalStreams} type="button">
          CLR ARR
        </button>
        <button
          className="scenario-stream-danger"
          onClick={onDeleteArrivalStreamAircraft}
          type="button"
        >
          DEL ARR
        </button>
      </div>
    </div>
  );
}
