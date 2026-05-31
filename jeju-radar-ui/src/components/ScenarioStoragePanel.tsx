import type { ChangeEvent, MutableRefObject } from "react";
import type { BuiltInScenarioPreset } from "../lib/scenarioPresets";
import type { SavedScenarioRecord } from "../lib/scenarioStorage";
import type { RunwayMode } from "../lib/types";

interface ScenarioStoragePanelProps {
  builtInScenarioPresets: BuiltInScenarioPreset[];
  importInputRef: MutableRefObject<HTMLInputElement | null>;
  onClose: () => void;
  onDeleteSelectedScenario: () => void;
  onExportSelectedScenario: () => void;
  onImportScenarioFile: (event: ChangeEvent<HTMLInputElement>) => void;
  onLoadSelectedBuiltInPreset: () => void;
  onLoadSelectedScenario: () => void;
  onSaveScenario: () => void;
  onSelectedBuiltInPresetIdChange: (presetId: string | null) => void;
  onSelectedScenarioRecordIdChange: (recordId: string | null) => void;
  onStorageNameChange: (name: string) => void;
  savedScenarioRecords: SavedScenarioRecord[];
  scenarioStorageMessage: string | null;
  scenarioStorageName: string;
  selectedBuiltInPreset: BuiltInScenarioPreset | null;
  selectedBuiltInPresetId: string | null;
  selectedRunway: RunwayMode;
  selectedScenarioRecordId: string | null;
  selectedSavedScenario: SavedScenarioRecord | null;
}

export default function ScenarioStoragePanel({
  builtInScenarioPresets,
  importInputRef,
  onClose,
  onDeleteSelectedScenario,
  onExportSelectedScenario,
  onImportScenarioFile,
  onLoadSelectedBuiltInPreset,
  onLoadSelectedScenario,
  onSaveScenario,
  onSelectedBuiltInPresetIdChange,
  onSelectedScenarioRecordIdChange,
  onStorageNameChange,
  savedScenarioRecords,
  scenarioStorageMessage,
  scenarioStorageName,
  selectedBuiltInPreset,
  selectedBuiltInPresetId,
  selectedRunway,
  selectedScenarioRecordId,
  selectedSavedScenario
}: ScenarioStoragePanelProps) {
  return (
    <section
      className="scenario-stream-panel scenario-storage-panel"
      aria-label="Scenario storage panel"
      data-testid="scenario-storage-panel"
    >
      <div className="aircraft-control-header">
        <div>
          <span>SCENARIO</span>
          <strong>SNAPSHOT SAVE / LOAD</strong>
        </div>
        <button
          className="aircraft-control-close"
          data-testid="scenario-storage-close"
          onClick={onClose}
          type="button"
        >
          X
        </button>
      </div>

      <div className="scenario-stream-section">
        <div className="scenario-stream-title">
          <strong>CURRENT SNAPSHOT</strong>
          <span>aircraft, procedure state, traffic streams</span>
        </div>
        <div className="scenario-storage-grid">
          <label>
            NAME
            <input
              data-testid="scenario-storage-name-input"
              placeholder={`RWY${selectedRunway}_TRAINING`}
              value={scenarioStorageName}
              onChange={(event) => onStorageNameChange(event.target.value)}
            />
          </label>
          <button
            className="aircraft-control-apply"
            data-testid="scenario-save-current"
            onClick={onSaveScenario}
            type="button"
          >
            SAVE CURRENT
          </button>
        </div>
        <div className="aircraft-create-hint">
          저장 포함: aircraft state, STAR/SID/ILS 진행, ARR/DEP stream, runway, overlay, pause.
          측정선과 열린 패널은 저장하지 않는다.
        </div>
      </div>

      <div className="scenario-stream-section">
        <div className="scenario-stream-title">
          <strong>BUILT-IN PRESETS</strong>
          <span>{builtInScenarioPresets.length} ready</span>
        </div>
        <div className="scenario-storage-grid">
          <label>
            PRESET
            <select
              data-testid="scenario-built-in-preset-select"
              value={selectedBuiltInPresetId ?? ""}
              onChange={(event) => onSelectedBuiltInPresetIdChange(event.target.value || null)}
            >
              {builtInScenarioPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.snapshot.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="aircraft-control-apply"
            data-testid="scenario-load-built-in-preset"
            onClick={onLoadSelectedBuiltInPreset}
            type="button"
          >
            LOAD PRESET
          </button>
        </div>
        {selectedBuiltInPreset ? (
          <div className="scenario-stream-active">
            <span>
              {selectedBuiltInPreset.snapshot.aircraft.length} ACFT / RWY{" "}
              {selectedBuiltInPreset.snapshot.runway} /{" "}
              <strong data-testid="scenario-built-in-preset-flow-label">
                {selectedBuiltInPreset.flow.label}
              </strong>
            </span>
          </div>
        ) : null}
      </div>

      <div className="scenario-stream-section">
        <div className="scenario-stream-title">
          <strong>SAVED SNAPSHOTS</strong>
          <span>{savedScenarioRecords.length} local</span>
        </div>
        <div className="scenario-storage-grid">
          <label>
            LOAD
            <select
              data-testid="scenario-saved-scenario-select"
              value={selectedScenarioRecordId ?? ""}
              onChange={(event) => onSelectedScenarioRecordIdChange(event.target.value || null)}
            >
              {savedScenarioRecords.length === 0 ? (
                <option value="">NO SAVED SCENARIO</option>
              ) : null}
              {savedScenarioRecords.map((record) => (
                <option key={record.id} value={record.id}>
                  {record.name}
                </option>
              ))}
            </select>
          </label>
          <button
            className="aircraft-control-apply"
            data-testid="scenario-load-saved-scenario"
            onClick={onLoadSelectedScenario}
            type="button"
          >
            LOAD
          </button>
        </div>

        {selectedSavedScenario ? (
          <div className="scenario-stream-active">
            <span>
              {selectedSavedScenario.snapshot.aircraft.length} ACFT / RWY{" "}
              {selectedSavedScenario.snapshot.runway} /{" "}
              {new Date(selectedSavedScenario.savedAt).toLocaleString()}
            </span>
          </div>
        ) : null}

        <div className="scenario-stream-actions three scenario-storage-actions">
          <button
            className="scenario-stream-secondary"
            data-testid="scenario-export-selected"
            onClick={onExportSelectedScenario}
            type="button"
          >
            EXPORT
          </button>
          <button
            className="scenario-stream-secondary"
            data-testid="scenario-import-trigger"
            onClick={() => importInputRef.current?.click()}
            type="button"
          >
            IMPORT
          </button>
          <button
            className="scenario-stream-danger"
            data-testid="scenario-delete-selected"
            onClick={onDeleteSelectedScenario}
            type="button"
          >
            DELETE
          </button>
        </div>
        <input
          ref={importInputRef}
          accept="application/json,.json"
          className="scenario-storage-import-input"
          data-testid="scenario-import-input"
          onChange={onImportScenarioFile}
          type="file"
        />
      </div>

      {scenarioStorageMessage ? (
        <div
          className="aircraft-control-error scenario-storage-message"
          data-testid="scenario-storage-message"
        >
          {scenarioStorageMessage}
        </div>
      ) : null}
    </section>
  );
}
