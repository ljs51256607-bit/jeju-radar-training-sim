import type { DepartureWaveForm } from "../lib/scenarioStorage";
import type { DepartureRunway, ScenarioFixRoleRecord } from "../lib/types";

interface DepartureWavePanelProps {
  departureFixes: ScenarioFixRoleRecord[];
  departureRunway: DepartureRunway;
  form: DepartureWaveForm;
  onClearDepartureWaves: (departureRunway: DepartureRunway) => void;
  onDeleteDepartureWaveAircraft: (departureRunway: DepartureRunway) => void;
  onFormChange: (
    departureRunway: DepartureRunway,
    field: keyof DepartureWaveForm,
    value: string
  ) => void;
  onStartDepartureWave: (departureRunway: DepartureRunway) => void;
  title: string;
}

export default function DepartureWavePanel({
  departureFixes,
  departureRunway,
  form,
  onClearDepartureWaves,
  onDeleteDepartureWaveAircraft,
  onFormChange,
  onStartDepartureWave,
  title
}: DepartureWavePanelProps) {
  return (
    <div className="scenario-stream-section departure-runway-panel">
      <div className="scenario-stream-title">
        <strong>{title}</strong>
        <span>{departureRunway} roll, SID selected by runway + exit fix</span>
      </div>
      <div className="scenario-stream-grid">
        <label>
          EXIT
          <select
            value={form.exitFix}
            onChange={(event) => onFormChange(departureRunway, "exitFix", event.target.value)}
          >
            {departureFixes.map((fix) => (
              <option key={fix.fix_id} value={fix.fix_id}>
                {fix.fix_id}
              </option>
            ))}
          </select>
        </label>
        <label>
          MIN
          <input
            inputMode="decimal"
            value={form.intervalMin}
            onChange={(event) => onFormChange(departureRunway, "intervalMin", event.target.value)}
          />
        </label>
        <label>
          COUNT
          <input
            inputMode="numeric"
            value={form.count}
            onChange={(event) => onFormChange(departureRunway, "count", event.target.value)}
          />
        </label>
        <label>
          ALT
          <input
            disabled
            value={form.altitude}
            onChange={(event) => onFormChange(departureRunway, "altitude", event.target.value)}
          />
        </label>
        <label>
          SPD
          <input
            disabled
            inputMode="numeric"
            value={form.speed}
            onChange={(event) => onFormChange(departureRunway, "speed", event.target.value)}
          />
        </label>
        <label>
          VS
          <input
            inputMode="numeric"
            value={form.verticalRate}
            onChange={(event) => onFormChange(departureRunway, "verticalRate", event.target.value)}
          />
        </label>
        <label>
          TYPE
          <input
            value={form.aircraftType}
            onChange={(event) =>
              onFormChange(departureRunway, "aircraftType", event.target.value.toUpperCase())
            }
          />
        </label>
        <label>
          CALL
          <input
            placeholder="AUTO or KAL"
            title="AUTO는 한국 항공사 콜사인을 랜덤 배정하고, JJA/KAL처럼 입력하면 해당 prefix 순번을 사용한다."
            value={form.callsignPrefix}
            onChange={(event) =>
              onFormChange(departureRunway, "callsignPrefix", event.target.value.toUpperCase())
            }
          />
        </label>
        <label>
          DEST
          <input
            value={form.destinationAirport}
            onChange={(event) =>
              onFormChange(departureRunway, "destinationAirport", event.target.value.toUpperCase())
            }
          />
        </label>
      </div>
      <div className="aircraft-create-hint">
        RWY{departureRunway} DEP는 해당 threshold에서 roll 후 A010/180KT에서 SID를 타고 A100까지 climb, 10000ft 초과 시 300KT 자동 증속.
      </div>
      <div className="scenario-stream-actions departure">
        <button
          className="aircraft-control-apply"
          onClick={() => onStartDepartureWave(departureRunway)}
          type="button"
        >
          START RWY{departureRunway}
        </button>
        <button
          className="scenario-stream-clear"
          onClick={() => onClearDepartureWaves(departureRunway)}
          type="button"
        >
          CLR {departureRunway}
        </button>
        <button
          className="scenario-stream-danger"
          onClick={() => onDeleteDepartureWaveAircraft(departureRunway)}
          type="button"
        >
          DEL {departureRunway}
        </button>
      </div>
    </div>
  );
}
