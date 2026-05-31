import { DEFAULT_SCENARIO_OVERLAYS } from "./scopeViewModel";
import {
  defaultScenarioStreamForm,
  normalizeScenarioStreamForm
} from "./scenarioTraffic";
import {
  jsonClone,
  retimeAircraftForScenarioLoad,
  retimeDepartureWaveForScenarioLoad,
  scenarioRecordId,
  type ArrivalStream,
  type DepartureWave,
  type ScenarioOverlayState,
  type ScenarioSnapshotV1,
  type ScenarioStreamForm,
  type SimulationSpeed
} from "./scenarioStorage";
import {
  defaultWindSettings,
  normalizeWindSettings
} from "./windModel";
import type {
  AircraftState,
  DensityMode,
  RunwayMode,
  SurfaceMode,
  WindSettings
} from "./types";

export interface BuildScenarioSnapshotArgs {
  name: string;
  runway: RunwayMode;
  radarPaused: boolean;
  surfaceMode: SurfaceMode;
  densityMode: DensityMode;
  overlays: ScenarioOverlayState;
  showChrome: boolean;
  simulationSpeed: SimulationSpeed;
  aircraftTraffic: AircraftState[];
  scenarioForm: ScenarioStreamForm;
  activeArrivalStreams: ArrivalStream[];
  activeDepartureWaves: DepartureWave[];
  windSettings: WindSettings;
  savedAtIso?: string;
  id?: string;
}

export interface LoadedScenarioSnapshotState {
  nowMs: number;
  selectedRunway: RunwayMode;
  surfaceMode: SurfaceMode;
  densityMode: DensityMode;
  overlays: ScenarioOverlayState;
  showChrome: boolean;
  simulationSpeed: SimulationSpeed;
  radarPaused: boolean;
  aircraftTraffic: AircraftState[];
  scenarioForm: ScenarioStreamForm;
  activeArrivalStreams: ArrivalStream[];
  activeDepartureWaves: DepartureWave[];
  windSettings: WindSettings;
}

export function buildScenarioSnapshot({
  name,
  runway,
  radarPaused,
  surfaceMode,
  densityMode,
  overlays,
  showChrome,
  simulationSpeed,
  aircraftTraffic,
  scenarioForm,
  activeArrivalStreams,
  activeDepartureWaves,
  windSettings,
  savedAtIso = new Date().toISOString(),
  id = scenarioRecordId()
}: BuildScenarioSnapshotArgs): ScenarioSnapshotV1 {
  return {
    version: 1,
    id,
    name,
    savedAt: savedAtIso,
    runway,
    radar: {
      paused: radarPaused,
      surfaceMode,
      densityMode,
      scopeExtentMode: "tma",
      overlays: jsonClone(overlays),
      showChrome,
      simulationSpeed
    },
    aircraft: jsonClone(aircraftTraffic),
    traffic: {
      scenarioForm: jsonClone(scenarioForm),
      activeArrivalStreams: jsonClone(activeArrivalStreams),
      activeDepartureWaves: jsonClone(activeDepartureWaves)
    },
    weather: {
      wind: normalizeWindSettings(windSettings)
    }
  };
}

export function loadedScenarioSnapshotState(
  snapshot: ScenarioSnapshotV1,
  nowMs = Date.now()
): LoadedScenarioSnapshotState {
  const savedAtMs = Date.parse(snapshot.savedAt);
  const deltaMs = Number.isFinite(savedAtMs) ? nowMs - savedAtMs : 0;

  return {
    nowMs,
    selectedRunway: snapshot.runway,
    surfaceMode: snapshot.radar.surfaceMode,
    densityMode: snapshot.radar.densityMode,
    overlays: {
      ...DEFAULT_SCENARIO_OVERLAYS,
      ...snapshot.radar.overlays
    },
    showChrome: snapshot.radar.showChrome,
    simulationSpeed: snapshot.radar.simulationSpeed ?? 1,
    radarPaused: snapshot.radar.paused,
    aircraftTraffic: jsonClone(snapshot.aircraft).map((aircraft) =>
      retimeAircraftForScenarioLoad(aircraft, deltaMs)
    ),
    scenarioForm: normalizeScenarioStreamForm(
      jsonClone(snapshot.traffic.scenarioForm ?? defaultScenarioStreamForm()),
      snapshot.runway
    ),
    activeArrivalStreams: jsonClone(snapshot.traffic.activeArrivalStreams),
    activeDepartureWaves: jsonClone(snapshot.traffic.activeDepartureWaves).map((wave) =>
      retimeDepartureWaveForScenarioLoad(wave, deltaMs)
    ),
    windSettings: normalizeWindSettings(snapshot.weather?.wind ?? defaultWindSettings())
  };
}
