import type {
  Dispatch,
  MutableRefObject,
  SetStateAction
} from "react";
import {
  buildScenarioSnapshot as buildScenarioSnapshotState,
  loadedScenarioSnapshotState
} from "../lib/scenarioSnapshotRuntime";
import type {
  ArrivalStream,
  DepartureWave,
  ScenarioOverlayState,
  ScenarioSnapshotV1,
  ScenarioStreamForm,
  SimulationSpeed
} from "../lib/scenarioStorage";
import type {
  AircraftState,
  DensityMode,
  RunwayMode,
  SurfaceMode,
  WindSettings
} from "../lib/types";

interface UseScenarioSnapshotControllerOptions {
  activeArrivalStreams: ArrivalStream[];
  activeDepartureWaves: DepartureWave[];
  aircraftTraffic: AircraftState[];
  densityMode: DensityMode;
  loadScenarioStreamState: (state: ScenarioSnapshotV1["traffic"]) => void;
  overlays: ScenarioOverlayState;
  radarPaused: boolean;
  resetAircraftCreateUi: () => void;
  resetScenarioStreamUi: () => void;
  scenarioForm: ScenarioStreamForm;
  selectedRunway: RunwayMode;
  setAircraftTraffic: Dispatch<SetStateAction<AircraftState[]>>;
  setControlError: Dispatch<SetStateAction<string | null>>;
  setControlPanelOpen: Dispatch<SetStateAction<boolean>>;
  setDensityMode: Dispatch<SetStateAction<DensityMode>>;
  setLastRadarUpdateAt: Dispatch<SetStateAction<number | null>>;
  setOverlays: Dispatch<SetStateAction<ScenarioOverlayState>>;
  setRadarPaused: Dispatch<SetStateAction<boolean>>;
  setSelectedAircraftId: Dispatch<SetStateAction<string | null>>;
  setSelectedRunway: Dispatch<SetStateAction<RunwayMode>>;
  setShowChrome: Dispatch<SetStateAction<boolean>>;
  setSimulationSpeed: Dispatch<SetStateAction<SimulationSpeed>>;
  setSurfaceMode: Dispatch<SetStateAction<SurfaceMode>>;
  setWindSettings: Dispatch<SetStateAction<WindSettings>>;
  showChrome: boolean;
  simulationSpeed: SimulationSpeed;
  simulationTimeRef: MutableRefObject<number>;
  surfaceMode: SurfaceMode;
  windSettings: WindSettings;
}

export function useScenarioSnapshotController({
  activeArrivalStreams,
  activeDepartureWaves,
  aircraftTraffic,
  densityMode,
  loadScenarioStreamState,
  overlays,
  radarPaused,
  resetAircraftCreateUi,
  resetScenarioStreamUi,
  scenarioForm,
  selectedRunway,
  setAircraftTraffic,
  setControlError,
  setControlPanelOpen,
  setDensityMode,
  setLastRadarUpdateAt,
  setOverlays,
  setRadarPaused,
  setSelectedAircraftId,
  setSelectedRunway,
  setShowChrome,
  setSimulationSpeed,
  setSurfaceMode,
  setWindSettings,
  showChrome,
  simulationSpeed,
  simulationTimeRef,
  surfaceMode,
  windSettings
}: UseScenarioSnapshotControllerOptions) {
  function buildScenarioSnapshot(name: string): ScenarioSnapshotV1 {
    return buildScenarioSnapshotState({
      name,
      runway: selectedRunway,
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
      windSettings
    });
  }

  function loadScenarioSnapshot(snapshot: ScenarioSnapshotV1) {
    const loadedState = loadedScenarioSnapshotState(snapshot);
    simulationTimeRef.current = loadedState.nowMs;

    setSelectedRunway(loadedState.selectedRunway);
    setSurfaceMode(loadedState.surfaceMode);
    setDensityMode(loadedState.densityMode);
    setOverlays(loadedState.overlays);
    setShowChrome(loadedState.showChrome);
    setSimulationSpeed(loadedState.simulationSpeed);
    setRadarPaused(loadedState.radarPaused);
    setLastRadarUpdateAt(loadedState.nowMs);
    setAircraftTraffic(loadedState.aircraftTraffic);
    loadScenarioStreamState({
      scenarioForm: loadedState.scenarioForm,
      activeArrivalStreams: loadedState.activeArrivalStreams,
      activeDepartureWaves: loadedState.activeDepartureWaves
    });
    setWindSettings(loadedState.windSettings);

    setSelectedAircraftId(null);
    setControlPanelOpen(false);
    resetScenarioStreamUi();
    resetAircraftCreateUi();
    setControlError(null);
  }

  return {
    buildScenarioSnapshot,
    loadScenarioSnapshot
  };
}
