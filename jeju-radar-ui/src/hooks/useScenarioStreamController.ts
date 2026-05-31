import { useEffect, useRef, useState, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import {
  arrivalStarGuidanceForFix,
  createArrivalStreamAircraft,
  farthestArrivalDistanceNm
} from "../lib/aircraftFactory";
import { procedureVisibleForRunwayMode } from "../lib/procedureRouteUtils";
import {
  scenarioStreamFormAfterDepartureWaveFieldChange,
  scenarioStreamFormAfterFieldChange
} from "../lib/scenarioFormRuntime";
import {
  buildArrivalStreamDraft,
  buildDepartureWaveStartDraft,
  parseArrivalAddCount,
  parseArrivalKeepBuffer
} from "../lib/scenarioStreamDraft";
import {
  buildScenarioStreamPreset,
  loadSavedScenarioStreamPresetRecords,
  normalizeImportedScenarioStreamPreset,
  persistSavedScenarioStreamPresetRecords,
  scenarioStreamPresetExportFilename,
  scenarioStreamPresetExportJsonForPreset,
  scenarioStreamPresetLoadError,
  type ScenarioStreamPresetV1
} from "../lib/scenarioStreamPresets";
import {
  type ArrivalStream,
  type DepartureWave,
  type DepartureWaveForm,
  type ScenarioSnapshotV1,
  type ScenarioStreamForm,
  type SimulationSpeed
} from "../lib/scenarioStorage";
import { defaultScenarioStreamForm } from "../lib/scenarioTraffic";
import {
  radarTickIntervalMs
} from "../lib/simulationTickRuntime";
import {
  advanceDepartureWavesAfterSpawn,
  departureWavesDueForSpawn,
  fillArrivalStreamAircraft,
  retimeDepartureWavesAfterMissedApproach,
  spawnDepartureWaveAircraft
} from "../lib/trafficGeneratorRuntime";
import type {
  AircraftState,
  DepartureRunway,
  RadarDataset,
  RunwayMode
} from "../lib/types";
import type { MissedApproachEvent } from "../lib/missedApproachRuntime";

interface UseScenarioStreamControllerOptions {
  aircraftTraffic: AircraftState[];
  dataset: RadarDataset | null;
  deleteAircraftWhere: (predicate: (aircraft: AircraftState) => boolean) => void;
  getSimulationNowMs: () => number;
  radarPaused: boolean;
  selectedRunway: RunwayMode;
  setAircraftTraffic: Dispatch<SetStateAction<AircraftState[]>>;
  simulationSpeed: SimulationSpeed;
}

type ScenarioStreamSnapshotState = ScenarioSnapshotV1["traffic"];

export function useScenarioStreamController({
  aircraftTraffic,
  dataset,
  deleteAircraftWhere,
  getSimulationNowMs,
  radarPaused,
  selectedRunway,
  setAircraftTraffic,
  simulationSpeed
}: UseScenarioStreamControllerOptions) {
  const [scenarioPanelOpen, setScenarioPanelOpen] = useState(false);
  const [scenarioForm, setScenarioForm] = useState<ScenarioStreamForm>(defaultScenarioStreamForm());
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [streamPresetName, setStreamPresetName] = useState("R07 stream flow");
  const [streamPresetRecords, setStreamPresetRecords] = useState<ScenarioStreamPresetV1[]>(() =>
    loadSavedScenarioStreamPresetRecords()
  );
  const [selectedStreamPresetId, setSelectedStreamPresetId] = useState<string>(() =>
    loadSavedScenarioStreamPresetRecords()[0]?.id ?? ""
  );
  const [activeArrivalStreams, setActiveArrivalStreams] = useState<ArrivalStream[]>([]);
  const [activeDepartureWaves, setActiveDepartureWaves] = useState<DepartureWave[]>([]);
  const streamPresetImportInputRef = useRef<HTMLInputElement | null>(null);
  const missedApproachDepartureFlowKeysRef = useRef<Set<string>>(new Set());
  const getSimulationNowMsRef = useRef(getSimulationNowMs);

  useEffect(() => {
    getSimulationNowMsRef.current = getSimulationNowMs;
  }, [getSimulationNowMs]);

  useEffect(() => {
    if (radarPaused || !dataset || activeDepartureWaves.length === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const nowMs = getSimulationNowMsRef.current();

      setActiveDepartureWaves((currentWaves) => {
        const dueWaves = departureWavesDueForSpawn(currentWaves, nowMs);

        if (dueWaves.length === 0) {
          return currentWaves;
        }

        setAircraftTraffic((currentAircraft) =>
          spawnDepartureWaveAircraft(dataset, dueWaves, currentAircraft, nowMs)
        );

        return advanceDepartureWavesAfterSpawn(currentWaves, dueWaves, nowMs);
      });
    }, radarTickIntervalMs(simulationSpeed));

    return () => window.clearInterval(intervalId);
  }, [activeDepartureWaves.length, dataset, radarPaused, setAircraftTraffic, simulationSpeed]);

  useEffect(() => {
    if (radarPaused || !dataset || activeArrivalStreams.length === 0) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const nowMs = getSimulationNowMsRef.current();

      setAircraftTraffic((currentAircraft) =>
        fillArrivalStreamAircraft(dataset, activeArrivalStreams, currentAircraft, nowMs)
      );
    }, radarTickIntervalMs(simulationSpeed));

    return () => window.clearInterval(intervalId);
  }, [activeArrivalStreams, dataset, radarPaused, setAircraftTraffic, simulationSpeed]);

  function loadScenarioStreamState(state: ScenarioStreamSnapshotState) {
    setScenarioForm(state.scenarioForm);
    setActiveArrivalStreams(state.activeArrivalStreams);
    setActiveDepartureWaves(state.activeDepartureWaves);
  }

  function resetScenarioStreamUi() {
    setScenarioPanelOpen(false);
    setScenarioError(null);
  }

  function retimeDepartureFlowAfterMissedApproach(event: MissedApproachEvent) {
    const eventKey = [
      event.aircraft.id,
      event.profile.id,
      event.aircraft.missed_approach_activated_at_ms ?? event.aircraft.missed_approach_reported_at_ms ?? 0
    ].join(":");

    if (missedApproachDepartureFlowKeysRef.current.has(eventKey)) {
      return;
    }

    missedApproachDepartureFlowKeysRef.current.add(eventKey);
    const nowMs = getSimulationNowMsRef.current();

    setActiveDepartureWaves((currentWaves) =>
      retimeDepartureWavesAfterMissedApproach(currentWaves, event, nowMs).waves
    );
  }

  function handleScenarioFormChange<K extends keyof ScenarioStreamForm>(
    field: K,
    value: ScenarioStreamForm[K]
  ) {
    setScenarioForm((currentForm) =>
      scenarioStreamFormAfterFieldChange(currentForm, field, value)
    );
    setScenarioError(null);
  }

  function persistNextStreamPresetRecords(nextRecords: ScenarioStreamPresetV1[]) {
    persistSavedScenarioStreamPresetRecords(nextRecords);
    setStreamPresetRecords(nextRecords);
  }

  function handleStreamPresetNameChange(name: string) {
    setStreamPresetName(name);
    setScenarioError(null);
  }

  function handleSelectedStreamPresetIdChange(presetId: string) {
    setSelectedStreamPresetId(presetId);
    setScenarioError(null);
  }

  function handleSaveStreamPreset() {
    const preset = buildScenarioStreamPreset({
      form: scenarioForm,
      name: streamPresetName,
      runway: selectedRunway
    });
    const nextRecords = [
      preset,
      ...streamPresetRecords.filter((record) => record.id !== preset.id)
    ];

    persistNextStreamPresetRecords(nextRecords);
    setSelectedStreamPresetId(preset.id);
    setScenarioError(`SAVED STREAM PRESET ${preset.name}`);
  }

  function handleLoadSelectedStreamPreset() {
    const preset = streamPresetRecords.find((record) => record.id === selectedStreamPresetId);

    if (!preset) {
      setScenarioError("로드할 STREAM PRESET 없음");
      return;
    }

    const runwayError = scenarioStreamPresetLoadError(preset, selectedRunway);

    if (runwayError) {
      setScenarioError(runwayError);
      return;
    }

    setScenarioForm(preset.form);
    setStreamPresetName(preset.name);
    setScenarioError(`LOADED STREAM PRESET ${preset.name}`);
  }

  function handleDeleteSelectedStreamPreset() {
    const nextRecords = streamPresetRecords.filter((record) => record.id !== selectedStreamPresetId);

    persistNextStreamPresetRecords(nextRecords);
    setSelectedStreamPresetId(nextRecords[0]?.id ?? "");
    setScenarioError(nextRecords.length > 0 ? "STREAM PRESET DELETED" : "STREAM PRESET LIST EMPTY");
  }

  function handleExportSelectedStreamPreset() {
    const preset = streamPresetRecords.find((record) => record.id === selectedStreamPresetId);

    if (!preset) {
      setScenarioError("EXPORT할 STREAM PRESET 없음");
      return;
    }

    const blob = new Blob([scenarioStreamPresetExportJsonForPreset(preset)], {
      type: "application/json"
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = scenarioStreamPresetExportFilename(preset);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    setScenarioError(`EXPORTED STREAM PRESET ${preset.name}`);
  }

  async function handleImportStreamPresetFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const rawText = await file.text();
      const parsedPreset = JSON.parse(rawText);
      const importedPreset = normalizeImportedScenarioStreamPreset(parsedPreset);

      if (!importedPreset) {
        setScenarioError("IMPORT 실패: v1 stream preset JSON 아님");
        return;
      }

      const preset = buildScenarioStreamPreset({
        form: importedPreset.form,
        name: importedPreset.name || file.name.replace(/\.json$/i, ""),
        runway: importedPreset.runway,
        savedAtIso: new Date().toISOString()
      });
      const nextRecords = [
        preset,
        ...streamPresetRecords.filter((record) => record.id !== preset.id)
      ];

      persistNextStreamPresetRecords(nextRecords);
      setSelectedStreamPresetId(preset.id);
      setStreamPresetName(preset.name);
      setScenarioError(`IMPORTED STREAM PRESET ${preset.name}`);
    } catch (importError) {
      setScenarioError(
        `IMPORT 실패: ${importError instanceof Error ? importError.message : String(importError)}`
      );
    }
  }

  function handleDepartureWaveFormChange(
    departureRunway: DepartureRunway,
    field: keyof DepartureWaveForm,
    value: string
  ) {
    setScenarioForm((currentForm) =>
      scenarioStreamFormAfterDepartureWaveFieldChange(currentForm, departureRunway, field, value)
    );
    setScenarioError(null);
  }

  function buildArrivalStreamConfig(
    targetBufferCount: number,
    streamId = `ARR-STREAM-${Date.now().toString(36).toUpperCase()}`
  ) {
    if (!dataset) {
      return null;
    }

    const stars = dataset.procedures.stars.filter((procedure) =>
      procedureVisibleForRunwayMode(procedure, selectedRunway)
    );
    const draft = buildArrivalStreamDraft({
      dataset,
      form: scenarioForm,
      selectedRunway,
      stars,
      targetBufferCount,
      streamId
    });

    if (draft.status === "error") {
      setScenarioError(draft.message);
      return null;
    }

    return draft.stream;
  }

  function handleAddArrivalStreamAircraft() {
    if (!dataset) {
      return;
    }

    const addCount = parseArrivalAddCount(scenarioForm);

    if (addCount === null) {
      setScenarioError("ADD 대수는 1-20");
      return;
    }

    const nowMs = getSimulationNowMsRef.current();
    const stream = buildArrivalStreamConfig(addCount, `ARR-ADD-${nowMs.toString(36).toUpperCase()}`);

    if (!stream) {
      return;
    }

    setAircraftTraffic((currentAircraft) => {
      const nextAircraft = [...currentAircraft];
      let farthestDistanceNm = farthestArrivalDistanceNm(dataset, nextAircraft, stream.entryFix);

      for (let index = 0; index < addCount; index += 1) {
        farthestDistanceNm += stream.spacingNm;

        const createdAircraft = createArrivalStreamAircraft(
          dataset,
          stream,
          farthestDistanceNm,
          nextAircraft,
          nextAircraft.length + index + 1,
          nowMs
        );

        if (createdAircraft) {
          nextAircraft.push(createdAircraft);
        }
      }

      return nextAircraft;
    });

    setScenarioError(null);
    setScenarioPanelOpen(false);
  }

  function handleStartArrivalAutoKeep() {
    const keepBuffer = parseArrivalKeepBuffer(scenarioForm);

    if (keepBuffer === null) {
      setScenarioError("KEEP BUFFER는 1-20");
      return;
    }

    const stream = buildArrivalStreamConfig(keepBuffer);

    if (!stream) {
      return;
    }

    setActiveArrivalStreams((currentStreams) => [
      ...currentStreams.filter((currentStream) => currentStream.entryFix !== stream.entryFix),
      stream
    ]);
    setScenarioError(null);
  }

  function handleStartDepartureWave(departureRunway: DepartureRunway) {
    if (!dataset) {
      return;
    }

    const nowMs = getSimulationNowMsRef.current();
    const draft = buildDepartureWaveStartDraft({
      dataset,
      form: scenarioForm[`departure${departureRunway}` as const],
      departureRunway,
      existingAircraft: aircraftTraffic,
      nowMs
    });

    if (draft.status === "error") {
      setScenarioError(draft.message);
      return;
    }

    setAircraftTraffic((currentAircraft) => [...currentAircraft, draft.firstAircraft]);

    if (draft.queuedWave) {
      setActiveDepartureWaves((currentWaves) => [...currentWaves, draft.queuedWave]);
    }

    setScenarioError(null);
    setScenarioPanelOpen(false);
  }

  function handleClearDepartureWaves(departureRunway?: DepartureRunway) {
    setActiveDepartureWaves((currentWaves) =>
      departureRunway
        ? currentWaves.filter((wave) => wave.departureRunway !== departureRunway)
        : []
    );
    setScenarioError(null);
  }

  function handleClearArrivalStreams() {
    setActiveArrivalStreams([]);
    setScenarioError(null);
  }

  function handleDeleteArrivalStreamAircraft() {
    setActiveArrivalStreams([]);
    deleteAircraftWhere((aircraft) => aircraft.scenario_stream_role === "arrival_stream");
    setScenarioError(null);
  }

  function handleDeleteDepartureWaveAircraft(departureRunway?: DepartureRunway) {
    setActiveDepartureWaves((currentWaves) =>
      departureRunway
        ? currentWaves.filter((wave) => wave.departureRunway !== departureRunway)
        : []
    );
    deleteAircraftWhere(
      (aircraft) =>
        aircraft.scenario_stream_role === "departure_wave" &&
        (!departureRunway || aircraft.departure_runway === departureRunway)
    );
    setScenarioError(null);
  }

  return {
    activeArrivalStreams,
    activeDepartureWaves,
    handleAddArrivalStreamAircraft,
    handleClearArrivalStreams,
    handleClearDepartureWaves,
    handleDeleteArrivalStreamAircraft,
    handleDeleteDepartureWaveAircraft,
    handleDepartureWaveFormChange,
    handleExportSelectedStreamPreset,
    handleImportStreamPresetFile,
    handleScenarioFormChange,
    handleDeleteSelectedStreamPreset,
    handleLoadSelectedStreamPreset,
    handleSaveStreamPreset,
    handleSelectedStreamPresetIdChange,
    handleStartArrivalAutoKeep,
    handleStartDepartureWave,
    handleStreamPresetNameChange,
    loadScenarioStreamState,
    resetScenarioStreamUi,
    retimeDepartureFlowAfterMissedApproach,
    scenarioError,
    scenarioForm,
    scenarioPanelOpen,
    setScenarioError,
    setScenarioPanelOpen,
    selectedStreamPresetId,
    selectedStreamPreset: streamPresetRecords.find((record) => record.id === selectedStreamPresetId) ?? null,
    streamPresetImportInputRef,
    streamPresetName,
    streamPresetRecords
  };
}
