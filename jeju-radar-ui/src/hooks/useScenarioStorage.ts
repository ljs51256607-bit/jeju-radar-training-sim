import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  jsonClone,
  loadSavedScenarioRecords,
  normalizeImportedScenarioSnapshot,
  persistSavedScenarioRecords,
  retimeAircraftForScenarioLoad,
  retimeDepartureWaveForScenarioLoad,
  scenarioExportFilename,
  scenarioExportJsonForSnapshot,
  scenarioRecordId,
  type SavedScenarioRecord,
  type ScenarioSnapshotV1
} from "../lib/scenarioStorage";
import { normalizeScenarioStreamForm } from "../lib/scenarioTraffic";
import {
  BUILT_IN_SCENARIO_PRESETS,
  RADIO_FLOW_HIGH_TRAFFIC_PRESET_ID,
  builtInScenarioPresetById
} from "../lib/scenarioPresets";
import { DEFAULT_SCENARIO_OVERLAYS } from "../lib/scopeViewModel";
import { normalizeWindSettings } from "../lib/windModel";
import type { RunwayMode } from "../lib/types";

interface UseScenarioStorageArgs {
  buildScenarioSnapshot: (name: string) => ScenarioSnapshotV1;
  loadScenarioSnapshot: (snapshot: ScenarioSnapshotV1) => void;
  selectedRunway: RunwayMode;
}

export function useScenarioStorage({
  buildScenarioSnapshot,
  loadScenarioSnapshot,
  selectedRunway
}: UseScenarioStorageArgs) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [storageName, setStorageName] = useState("");
  const [storageMessage, setStorageMessage] = useState<string | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedBuiltInPresetId, setSelectedBuiltInPresetId] = useState<string | null>(
    RADIO_FLOW_HIGH_TRAFFIC_PRESET_ID
  );
  const [records, setRecords] = useState<SavedScenarioRecord[]>(loadSavedScenarioRecords);

  useEffect(() => {
    if (records.length === 0) {
      setSelectedRecordId(null);
      return;
    }

    if (!selectedRecordId || !records.some((record) => record.id === selectedRecordId)) {
      setSelectedRecordId(records[0].id);
    }
  }, [records, selectedRecordId]);

  const selectedRecord = records.find((record) => record.id === selectedRecordId) ?? null;
  const selectedBuiltInPreset = builtInScenarioPresetById(selectedBuiltInPresetId);

  function closePanel() {
    setPanelOpen(false);
  }

  function openPanel() {
    setStorageMessage(null);
    setPanelOpen(true);
  }

  function handleStorageNameChange(name: string) {
    setStorageName(name);
    setStorageMessage(null);
  }

  function handleSelectedRecordIdChange(recordId: string | null) {
    setSelectedRecordId(recordId);
    setStorageMessage(null);
  }

  function handleSelectedBuiltInPresetIdChange(presetId: string | null) {
    setSelectedBuiltInPresetId(presetId);
    setStorageMessage(null);
  }

  function saveScenarioSnapshot(snapshot: ScenarioSnapshotV1, messagePrefix = "SAVED") {
    const record: SavedScenarioRecord = {
      id: snapshot.id,
      name: snapshot.name,
      savedAt: snapshot.savedAt,
      snapshot
    };

    setRecords((currentRecords) => {
      const nextRecords = [
        record,
        ...currentRecords.filter((currentRecord) => currentRecord.name !== record.name)
      ].slice(0, 40);

      persistSavedScenarioRecords(nextRecords);
      return nextRecords;
    });
    setSelectedRecordId(record.id);
    setStorageName(record.name);
    setStorageMessage(`${messagePrefix} ${record.name}`);
  }

  function handleSaveScenario() {
    const name =
      storageName.trim() ||
      `RWY${selectedRunway}_${new Date().toISOString().slice(0, 16).replace("T", "_")}`;

    saveScenarioSnapshot(buildScenarioSnapshot(name));
  }

  function handleLoadSelectedScenario() {
    if (!selectedRecord) {
      setStorageMessage("LOAD할 시나리오가 없음");
      return;
    }

    loadScenarioSnapshot(selectedRecord.snapshot);
    setPanelOpen(false);
    setStorageMessage(`LOADED ${selectedRecord.snapshot.name}`);
  }

  function handleLoadSelectedBuiltInPreset() {
    if (!selectedBuiltInPreset) {
      setStorageMessage("LOAD할 preset이 없음");
      return;
    }

    loadScenarioSnapshot(selectedBuiltInPreset.snapshot);
    setPanelOpen(false);
    setStorageMessage(`LOADED PRESET ${selectedBuiltInPreset.snapshot.name}`);
  }

  function handleDeleteSelectedScenario() {
    if (!selectedRecord) {
      setStorageMessage("삭제할 시나리오가 없음");
      return;
    }

    setRecords((currentRecords) => {
      const nextRecords = currentRecords.filter((record) => record.id !== selectedRecord.id);

      persistSavedScenarioRecords(nextRecords);
      return nextRecords;
    });
    setStorageMessage(`DELETED ${selectedRecord.name}`);
  }

  function handleExportSelectedScenario() {
    if (!selectedRecord) {
      setStorageMessage("EXPORT할 시나리오가 없음");
      return;
    }

    const blob = new Blob([scenarioExportJsonForSnapshot(selectedRecord.snapshot)], {
      type: "application/json"
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = scenarioExportFilename(selectedRecord.snapshot);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    setStorageMessage(`EXPORTED ${selectedRecord.name}`);
  }

  async function handleImportScenarioFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const rawText = await file.text();
      const parsedScenario = JSON.parse(rawText);
      const importedSnapshot = normalizeImportedScenarioSnapshot(parsedScenario);

      if (!importedSnapshot) {
        setStorageMessage("IMPORT 실패: v1 scenario JSON 아님");
        return;
      }

      const importedName = importedSnapshot.name || file.name.replace(/\.json$/i, "");
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const importedSavedAtMs = Date.parse(importedSnapshot.savedAt);
      const importDeltaMs = Number.isFinite(importedSavedAtMs) ? nowMs - importedSavedAtMs : 0;
      const snapshot: ScenarioSnapshotV1 = {
        ...importedSnapshot,
        id: scenarioRecordId(),
        name: importedName,
        savedAt: nowIso,
        aircraft: jsonClone(importedSnapshot.aircraft).map((aircraft) =>
          retimeAircraftForScenarioLoad(aircraft, importDeltaMs)
        ),
        radar: {
          ...importedSnapshot.radar,
          overlays: {
            ...DEFAULT_SCENARIO_OVERLAYS,
            ...importedSnapshot.radar.overlays
          }
        },
        traffic: {
          scenarioForm: normalizeScenarioStreamForm(importedSnapshot.traffic.scenarioForm, importedSnapshot.runway),
          activeArrivalStreams: jsonClone(importedSnapshot.traffic.activeArrivalStreams),
          activeDepartureWaves: jsonClone(importedSnapshot.traffic.activeDepartureWaves).map((wave) =>
            retimeDepartureWaveForScenarioLoad(wave, importDeltaMs)
          )
        },
        weather: {
          wind: normalizeWindSettings(importedSnapshot.weather?.wind)
        }
      };

      saveScenarioSnapshot(snapshot, "IMPORTED");
    } catch (importError) {
      setStorageMessage(
        `IMPORT 실패: ${importError instanceof Error ? importError.message : String(importError)}`
      );
    }
  }

  return {
    closePanel,
    handleDeleteSelectedScenario,
    handleExportSelectedScenario,
    handleImportScenarioFile,
    handleLoadSelectedBuiltInPreset,
    handleLoadSelectedScenario,
    handleSaveScenario,
    handleSelectedBuiltInPresetIdChange,
    handleSelectedRecordIdChange,
    handleStorageNameChange,
    importInputRef,
    openPanel,
    panelOpen,
    builtInScenarioPresets: BUILT_IN_SCENARIO_PRESETS,
    records,
    selectedBuiltInPreset,
    selectedBuiltInPresetId,
    selectedRecord,
    selectedRecordId,
    storageMessage,
    storageName
  };
}
