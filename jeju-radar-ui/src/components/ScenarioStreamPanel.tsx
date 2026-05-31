import type { ChangeEvent, MutableRefObject } from "react";
import ActiveTrafficSummary from "./ActiveTrafficSummary";
import ArrivalStreamPanel from "./ArrivalStreamPanel";
import DepartureWavePanel from "./DepartureWavePanel";
import TrafficModeTabs from "./TrafficModeTabs";
import { MISSED_APPROACH_PROBABILITY_OPTIONS } from "../lib/missedApproachRuntime";
import type {
  ArrivalStream,
  DepartureWave,
  DepartureWaveForm,
  ScenarioStreamForm
} from "../lib/scenarioStorage";
import type { ScenarioStreamPresetV1 } from "../lib/scenarioStreamPresets";
import type { TrafficPanelMode } from "../lib/trafficPanelMode";
import type { DepartureRunway, RunwayMode, ScenarioFixRoleRecord } from "../lib/types";

interface ScenarioStreamPanelProps {
  activeArrivalStreams: ArrivalStream[];
  activeDepartureWaves: DepartureWave[];
  arrivalStreamFixes: ScenarioFixRoleRecord[];
  departureRunwaysForPanel: DepartureRunway[];
  departureStreamFixesByRunway: Record<DepartureRunway, ScenarioFixRoleRecord[]>;
  onAddArrivalStreamAircraft: () => void;
  onClearArrivalStreams: () => void;
  onClearDepartureWaves: (departureRunway: DepartureRunway) => void;
  onClose: () => void;
  onDeleteArrivalStreamAircraft: () => void;
  onDeleteDepartureWaveAircraft: (departureRunway: DepartureRunway) => void;
  onDeleteSelectedStreamPreset: () => void;
  onDepartureWaveFormChange: (
    departureRunway: DepartureRunway,
    field: keyof DepartureWaveForm,
    value: string
  ) => void;
  onExportSelectedStreamPreset: () => void;
  onImportStreamPresetFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadSelectedStreamPreset: () => void;
  onSaveStreamPreset: () => void;
  onSelectedStreamPresetIdChange: (presetId: string) => void;
  onStartArrivalAutoKeep: () => void;
  onStartDepartureWave: (departureRunway: DepartureRunway) => void;
  onStreamPresetNameChange: (name: string) => void;
  onScenarioFormChange: <K extends keyof ScenarioStreamForm>(
    field: K,
    value: ScenarioStreamForm[K]
  ) => void;
  onForceMissedApproach: () => void;
  onTrafficModeChange: (mode: TrafficPanelMode) => void;
  scenarioError: string | null;
  scenarioForm: ScenarioStreamForm;
  selectedRunway: RunwayMode;
  selectedAircraftLabel: string | null;
  selectedStreamPreset: ScenarioStreamPresetV1 | null;
  selectedStreamPresetId: string;
  streamPresetImportInputRef: MutableRefObject<HTMLInputElement | null>;
  streamPresetName: string;
  streamPresetRecords: ScenarioStreamPresetV1[];
  trafficPanelMode: TrafficPanelMode;
}

export default function ScenarioStreamPanel({
  activeArrivalStreams,
  activeDepartureWaves,
  arrivalStreamFixes,
  departureRunwaysForPanel,
  departureStreamFixesByRunway,
  onAddArrivalStreamAircraft,
  onClearArrivalStreams,
  onClearDepartureWaves,
  onClose,
  onDeleteArrivalStreamAircraft,
  onDeleteDepartureWaveAircraft,
  onDeleteSelectedStreamPreset,
  onDepartureWaveFormChange,
  onExportSelectedStreamPreset,
  onForceMissedApproach,
  onImportStreamPresetFile,
  onLoadSelectedStreamPreset,
  onSaveStreamPreset,
  onScenarioFormChange,
  onSelectedStreamPresetIdChange,
  onStartArrivalAutoKeep,
  onStartDepartureWave,
  onStreamPresetNameChange,
  onTrafficModeChange,
  scenarioError,
  scenarioForm,
  selectedRunway,
  selectedAircraftLabel,
  selectedStreamPreset,
  selectedStreamPresetId,
  streamPresetImportInputRef,
  streamPresetName,
  streamPresetRecords,
  trafficPanelMode
}: ScenarioStreamPanelProps) {
  return (
    <section className="scenario-stream-panel" aria-label="Scenario stream panel">
      <div className="aircraft-control-header">
        <div>
          <span>TRAFFIC GENERATOR</span>
          <strong>STREAM FLOW</strong>
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

      <div className="scenario-stream-section">
        <div className="scenario-stream-title">
          <strong>STREAM PRESETS</strong>
          <span>{streamPresetRecords.length} local</span>
        </div>
        <div className="scenario-stream-grid">
          <label>
            NAME
            <input
              value={streamPresetName}
              onChange={(event) => onStreamPresetNameChange(event.target.value)}
            />
          </label>
          <label>
            LOAD
            <select
              value={selectedStreamPresetId}
              onChange={(event) => onSelectedStreamPresetIdChange(event.target.value)}
            >
              <option value="">NONE</option>
              {streamPresetRecords.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  RWY{preset.runway} {preset.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="scenario-stream-actions three">
          <button className="aircraft-control-apply" onClick={onSaveStreamPreset} type="button">
            SAVE PRESET
          </button>
          <button className="scenario-stream-secondary" onClick={onLoadSelectedStreamPreset} type="button">
            LOAD
          </button>
          <button className="scenario-stream-clear" onClick={onDeleteSelectedStreamPreset} type="button">
            DEL
          </button>
        </div>
        <div className="scenario-stream-actions two">
          <button
            className="scenario-stream-secondary"
            data-testid="stream-preset-export-selected"
            onClick={onExportSelectedStreamPreset}
            type="button"
          >
            EXPORT
          </button>
          <button
            className="scenario-stream-secondary"
            data-testid="stream-preset-import-trigger"
            onClick={() => streamPresetImportInputRef.current?.click()}
            type="button"
          >
            IMPORT
          </button>
        </div>
        <input
          ref={streamPresetImportInputRef}
          accept="application/json,.json"
          className="scenario-storage-import-input"
          data-testid="stream-preset-import-input"
          onChange={onImportStreamPresetFile}
          type="file"
        />
        <div className="scenario-stream-status">
          {selectedStreamPreset
            ? `RWY${selectedStreamPreset.runway} / ${selectedStreamPreset.form.arrivalFix} / ${selectedStreamPreset.form.arrivalSpacingNm}NM`
            : `RWY${selectedRunway} / CURRENT FORM`}
        </div>
      </div>

      <ArrivalStreamPanel
        arrivalStreamFixes={arrivalStreamFixes}
        onAddArrivalStreamAircraft={onAddArrivalStreamAircraft}
        onClearArrivalStreams={onClearArrivalStreams}
        onDeleteArrivalStreamAircraft={onDeleteArrivalStreamAircraft}
        onFormChange={onScenarioFormChange}
        onStartArrivalAutoKeep={onStartArrivalAutoKeep}
        scenarioForm={scenarioForm}
      />

      <div className="scenario-stream-section">
        <div className="scenario-stream-title">
          <strong>MISSED APP</strong>
          <span>TWR event, ILS Z final 5NM</span>
        </div>
        <div className="scenario-stream-grid">
          <label>
            PROB
            <select
              value={scenarioForm.missedApproachProbability}
              onChange={(event) =>
                onScenarioFormChange("missedApproachProbability", event.target.value)
              }
            >
              {MISSED_APPROACH_PROBABILITY_OPTIONS.map((probability) => (
                <option key={probability} value={String(probability)}>
                  {probability}%
                </option>
              ))}
            </select>
          </label>
          <label>
            SELECTED
            <input disabled value={selectedAircraftLabel ?? "-"} />
          </label>
        </div>
        <div className="scenario-stream-actions two">
          <button className="scenario-stream-secondary" onClick={onForceMissedApproach} type="button">
            FORCE MISS
          </button>
          <span className="scenario-stream-status">
            {scenarioForm.missedApproachProbability}% AUTO
          </span>
        </div>
      </div>

      {departureRunwaysForPanel.map((departureRunway) => (
        <DepartureWavePanel
          departureFixes={departureStreamFixesByRunway[departureRunway]}
          departureRunway={departureRunway}
          form={scenarioForm[`departure${departureRunway}` as const]}
          key={departureRunway}
          onClearDepartureWaves={onClearDepartureWaves}
          onDeleteDepartureWaveAircraft={onDeleteDepartureWaveAircraft}
          onFormChange={onDepartureWaveFormChange}
          onStartDepartureWave={onStartDepartureWave}
          title={selectedRunway === "07" ? "DEP WAVE" : `RWY${departureRunway} DEP WAVE`}
        />
      ))}

      <ActiveTrafficSummary
        activeArrivalStreams={activeArrivalStreams}
        activeDepartureWaves={activeDepartureWaves}
      />

      {scenarioError ? <div className="aircraft-control-error">{scenarioError}</div> : null}
    </section>
  );
}
