import {
  defaultAircraftCreateForm,
  firstAvailableDepartureFixId,
  normalizeFixId,
  type AircraftCreateForm
} from "./scenarioTraffic";
import type {
  DepartureRunway,
  RadarDataset,
  RunwayMode
} from "./types";
import type { TrafficPanelMode } from "./trafficPanelMode";

type AircraftCreateSpawnPanelMode = Extract<TrafficPanelMode, "fix" | "map">;

export interface AircraftCreateFormChangeSideEffects {
  resetMapSpawnPick: boolean;
  trafficPanelMode?: AircraftCreateSpawnPanelMode;
}

export function aircraftCreateFormChangeSideEffects<K extends keyof AircraftCreateForm>(
  field: K,
  value: AircraftCreateForm[K]
): AircraftCreateFormChangeSideEffects {
  return {
    resetMapSpawnPick: field === "phase" || (field === "spawnMode" && value === "fix"),
    trafficPanelMode:
      field === "spawnMode"
        ? value === "map"
          ? "map"
          : "fix"
        : undefined
  };
}

export function aircraftCreateFormAfterFieldChange<K extends keyof AircraftCreateForm>({
  currentForm,
  field,
  value,
  selectedRunway,
  dataset
}: {
  currentForm: AircraftCreateForm;
  field: K;
  value: AircraftCreateForm[K];
  selectedRunway: RunwayMode;
  dataset: RadarDataset | null;
}): AircraftCreateForm {
  if (field === "phase") {
    const phase = value as AircraftCreateForm["phase"];
    const nextForm = defaultAircraftCreateForm(phase);
    const departureRunway = selectedRunway === "25" ? "25" : "07";

    if (phase !== "departure" || !dataset) {
      return nextForm;
    }

    return {
      ...nextForm,
      departureRunway,
      exitFix: firstAvailableDepartureFixId(dataset, departureRunway, nextForm.exitFix)
    };
  }

  if (field === "spawnMode") {
    const spawnMode = value as AircraftCreateForm["spawnMode"];

    return {
      ...currentForm,
      phase: spawnMode === "map" ? "arrival" : currentForm.phase,
      spawnMode,
      positionFix:
        spawnMode === "map" || currentForm.phase === "departure"
          ? ""
          : currentForm.positionFix || "DOTOL"
    };
  }

  if (field === "departureRunway") {
    const departureRunway = value as DepartureRunway;

    return {
      ...currentForm,
      departureRunway,
      exitFix: dataset
        ? firstAvailableDepartureFixId(dataset, departureRunway, currentForm.exitFix)
        : currentForm.exitFix,
      positionFix: currentForm.phase === "departure" ? "" : currentForm.positionFix
    };
  }

  if (field === "exitFix") {
    const exitFix = normalizeFixId(value as string);

    return {
      ...currentForm,
      exitFix,
      positionFix: currentForm.phase === "departure" ? "" : currentForm.positionFix
    };
  }

  return {
    ...currentForm,
    [field]: value
  };
}

export function aircraftCreateFormAfterTrafficPanelOpen(
  currentForm: AircraftCreateForm,
  mode: TrafficPanelMode
): AircraftCreateForm {
  return {
    ...currentForm,
    phase: mode === "map" ? "arrival" : currentForm.phase,
    spawnMode: mode === "map" ? "map" : "fix",
    positionFix:
      mode === "map"
        ? currentForm.spawnMode === "map"
          ? currentForm.positionFix
          : ""
        : currentForm.phase === "departure"
          ? ""
          : currentForm.positionFix || "DOTOL"
  };
}

export function aircraftCreateFormAfterMapSpawnPickToggle(
  currentForm: AircraftCreateForm
): AircraftCreateForm {
  return {
    ...currentForm,
    phase: "arrival",
    spawnMode: "map",
    positionFix: currentForm.spawnMode === "map" ? currentForm.positionFix : ""
  };
}
