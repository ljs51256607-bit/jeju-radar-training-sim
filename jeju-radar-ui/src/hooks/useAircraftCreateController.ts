import { useState, type Dispatch, type SetStateAction } from "react";
import {
  aircraftCreateFormAfterFieldChange,
  aircraftCreateFormAfterMapSpawnPickToggle,
  aircraftCreateFormAfterTrafficPanelOpen,
  aircraftCreateFormChangeSideEffects
} from "../lib/aircraftCreateFormRuntime";
import type { TrafficPanelMode } from "../lib/trafficPanelMode";
import {
  defaultAircraftCreateForm,
  departureRunwaysForRunwayMode,
  firstAvailableDepartureFixId,
  normalizeFixId,
  type AircraftCreateForm,
  type MapSpawnPoint
} from "../lib/scenarioTraffic";
import type { RadarDataset, RunwayMode } from "../lib/types";

interface UseAircraftCreateControllerOptions {
  dataset: RadarDataset | null;
  scenarioPanelOpen: boolean;
  selectedRunway: RunwayMode;
  setControlPanelOpen: Dispatch<SetStateAction<boolean>>;
  setScenarioError: Dispatch<SetStateAction<string | null>>;
  setScenarioPanelOpen: Dispatch<SetStateAction<boolean>>;
}

export function useAircraftCreateController({
  dataset,
  scenarioPanelOpen,
  selectedRunway,
  setControlPanelOpen,
  setScenarioError,
  setScenarioPanelOpen
}: UseAircraftCreateControllerOptions) {
  const [aircraftCreatePanelOpen, setAircraftCreatePanelOpen] = useState(false);
  const [aircraftCreateForm, setAircraftCreateForm] = useState<AircraftCreateForm>(
    defaultAircraftCreateForm()
  );
  const [aircraftCreateError, setAircraftCreateError] = useState<string | null>(null);
  const [aircraftMapSpawnPoint, setAircraftMapSpawnPoint] = useState<MapSpawnPoint | null>(null);
  const [mapSpawnPickActive, setMapSpawnPickActive] = useState(false);
  const [trafficPanelMode, setTrafficPanelMode] = useState<TrafficPanelMode>("fix");

  function clearAircraftCreateDraftState() {
    setAircraftMapSpawnPoint(null);
    setMapSpawnPickActive(false);
    setAircraftCreateError(null);
  }

  function resetAircraftCreateUi() {
    setAircraftCreatePanelOpen(false);
    clearAircraftCreateDraftState();
  }

  function closeTrafficPanel() {
    setAircraftCreatePanelOpen(false);
    setScenarioPanelOpen(false);
    setMapSpawnPickActive(false);
    setAircraftCreateError(null);
    setScenarioError(null);
  }

  function handleAircraftCreateFormChange<K extends keyof AircraftCreateForm>(
    field: K,
    value: AircraftCreateForm[K]
  ) {
    const sideEffects = aircraftCreateFormChangeSideEffects(field, value);

    if (sideEffects.resetMapSpawnPick) {
      setAircraftMapSpawnPoint(null);
      setMapSpawnPickActive(false);
    }

    if (sideEffects.trafficPanelMode) {
      setTrafficPanelMode(sideEffects.trafficPanelMode);
    }

    setAircraftCreateForm((currentForm) =>
      aircraftCreateFormAfterFieldChange({
        currentForm,
        field,
        value,
        selectedRunway,
        dataset
      })
    );
    setAircraftCreateError(null);
  }

  function handlePickMapSpawnPoint(point: MapSpawnPoint) {
    setAircraftMapSpawnPoint(point);
    setMapSpawnPickActive(false);
    setTrafficPanelMode("map");
    setAircraftCreateForm((currentForm) => ({
      ...currentForm,
      phase: "arrival",
      spawnMode: "map",
      positionFix: currentForm.spawnMode === "map" ? currentForm.positionFix : ""
    }));
    setAircraftCreatePanelOpen(true);
    setScenarioPanelOpen(false);
    setControlPanelOpen(false);
    setAircraftCreateError(null);
  }

  function handlePickedFixSpawn(fixId: string, errorMessage: string | null) {
    setAircraftMapSpawnPoint(null);
    setMapSpawnPickActive(false);
    setTrafficPanelMode("fix");
    setAircraftCreateForm((currentForm) => ({
      ...currentForm,
      phase: "arrival",
      spawnMode: "fix",
      positionFix: normalizeFixId(fixId)
    }));
    setAircraftCreatePanelOpen(true);
    setScenarioPanelOpen(false);
    setAircraftCreateError(errorMessage);
  }

  function handleRunwayModeChange(runway: RunwayMode) {
    if (!dataset) {
      return;
    }

    const departureRunway = departureRunwaysForRunwayMode(runway)[0];
    setAircraftCreateForm((currentForm) => {
      if (currentForm.phase !== "departure") {
        return currentForm;
      }

      return {
        ...currentForm,
        departureRunway,
        exitFix: firstAvailableDepartureFixId(dataset, departureRunway, currentForm.exitFix)
      };
    });
  }

  function openTrafficPanelState(mode: TrafficPanelMode) {
    setTrafficPanelMode(mode);
    setAircraftCreateError(null);
    setScenarioError(null);

    if (mode === "stream") {
      setAircraftCreatePanelOpen(false);
      setScenarioPanelOpen(true);
      setMapSpawnPickActive(false);
      return;
    }

    setScenarioPanelOpen(false);
    setAircraftCreatePanelOpen(true);
    setAircraftCreateForm((currentForm) =>
      aircraftCreateFormAfterTrafficPanelOpen(currentForm, mode)
    );

    if (mode === "fix") {
      setAircraftMapSpawnPoint(null);
      setMapSpawnPickActive(false);
    }
  }

  function toggleTrafficPanelState() {
    if (aircraftCreatePanelOpen || scenarioPanelOpen || mapSpawnPickActive) {
      closeTrafficPanel();
      setAircraftMapSpawnPoint(null);
      return true;
    }

    return false;
  }

  function handleCloseAircraftCreatePanel() {
    closeTrafficPanel();
    setAircraftMapSpawnPoint(null);
  }

  function handleToggleMapSpawnPick() {
    setAircraftCreateForm(aircraftCreateFormAfterMapSpawnPickToggle);
    setMapSpawnPickActive((current) => !current);
    setAircraftCreateError(null);
  }

  function failAircraftCreate(message: string, activateMapPick: boolean) {
    setAircraftCreateError(message);
    if (activateMapPick) {
      setMapSpawnPickActive(true);
    }
  }

  function completeAircraftCreate() {
    setAircraftCreatePanelOpen(false);
    setAircraftMapSpawnPoint(null);
    setMapSpawnPickActive(false);
    setAircraftCreateError(null);
  }

  return {
    aircraftCreateError,
    aircraftCreateForm,
    aircraftCreatePanelOpen,
    aircraftMapSpawnPoint,
    clearAircraftCreateDraftState,
    closeTrafficPanel,
    completeAircraftCreate,
    failAircraftCreate,
    handleAircraftCreateFormChange,
    handleCloseAircraftCreatePanel,
    handlePickedFixSpawn,
    handlePickMapSpawnPoint,
    handleRunwayModeChange,
    handleToggleMapSpawnPick,
    mapSpawnPickActive,
    openTrafficPanelState,
    resetAircraftCreateUi,
    setAircraftCreatePanelOpen,
    setAircraftCreateError,
    setAircraftCreateForm,
    setAircraftMapSpawnPoint,
    setMapSpawnPickActive,
    setTrafficPanelMode,
    toggleTrafficPanelState,
    trafficPanelMode
  };
}
