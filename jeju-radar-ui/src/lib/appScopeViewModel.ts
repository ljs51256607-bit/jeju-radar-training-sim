import type { AtcSpeechStatus } from "./atcSpeechClient";
import { parseMagneticVariationWestDeg } from "./aircraftControlPanel";
import { holdingPatternForFix } from "./holdingPatterns";
import { procedureVisibleForRunwayMode } from "./procedureRouteUtils";
import type { AircraftCreateForm } from "./scenarioTraffic";
import {
  departureRunwaysForRunwayMode,
  normalizeFixId,
  runwayIdVisibleForRunwayMode,
  sortedDepartureFixesForRunway,
  sortedScenarioFixes
} from "./scenarioTraffic";
import type { ScenarioOverlayState } from "./scenarioStorage";
import {
  atcMicrophoneHudViewModel,
  effectiveScopeOverlays,
  scopeOverlayCounts
} from "./scopeViewModel";
import type { TrafficPanelMode } from "./trafficPanelMode";
import type {
  AircraftState,
  DepartureRunway,
  ProcedureRecord,
  RadarDataset,
  RunwayMode,
  ScenarioFixRoleRecord,
  SurfaceMode
} from "./types";

interface AtcSpeechUiStatusLike {
  state: AtcSpeechStatus;
  detail: string;
}

export interface AppScopeViewModelOptions {
  aircraftCreateForm: AircraftCreateForm;
  aircraftCreatePanelOpen: boolean;
  aircraftTraffic: AircraftState[];
  atcMicLevel: number;
  atcSpeechStatus: AtcSpeechUiStatusLike;
  dataset: RadarDataset;
  overlays: ScenarioOverlayState;
  selectedAircraftId: string | null;
  selectedRunway: RunwayMode;
  surfaceMode: SurfaceMode;
  trafficPanelMode: TrafficPanelMode;
}

export interface AppScopeViewModel {
  aircraftCreateDepartureFixes: ScenarioFixRoleRecord[];
  aircraftCreateDepartureRunway: DepartureRunway;
  aircraftCreateExitFix: string;
  approachCount: number;
  approaches: ProcedureRecord[];
  arrivalStreamFixes: ScenarioFixRoleRecord[];
  atcMicHud: ReturnType<typeof atcMicrophoneHudViewModel>;
  departureRunwaysForPanel: DepartureRunway[];
  departureStreamFixesByRunway: Record<DepartureRunway, ScenarioFixRoleRecord[]>;
  effectiveOverlays: ScenarioOverlayState;
  fixSpawnPickActive: boolean;
  magneticVariationWestDeg: number;
  overlayCounts: ReturnType<typeof scopeOverlayCounts>;
  selectedAircraft: AircraftState | null;
  selectedPublishedHoldFixId: string | null;
  sidCount: number;
  sids: ProcedureRecord[];
  spawnFixes: RadarDataset["procedures"]["fixes"];
  starCount: number;
  stars: ProcedureRecord[];
  visibleAircraft: AircraftState[];
}

export function appScopeViewModel({
  aircraftCreateForm,
  aircraftCreatePanelOpen,
  aircraftTraffic,
  atcMicLevel,
  atcSpeechStatus,
  dataset,
  overlays,
  selectedAircraftId,
  selectedRunway,
  surfaceMode,
  trafficPanelMode
}: AppScopeViewModelOptions): AppScopeViewModel {
  const stars = dataset.procedures.stars.filter((procedure) =>
    procedureVisibleForRunwayMode(procedure, selectedRunway)
  );
  const sids = dataset.procedures.sids.filter((procedure) =>
    procedureVisibleForRunwayMode(procedure, selectedRunway)
  );
  const approaches = dataset.procedures.approaches.filter(
    (procedure) => procedure.runway === selectedRunway
  );
  const visibleAircraft = aircraftTraffic.filter((aircraft) =>
    runwayIdVisibleForRunwayMode(aircraft.target_runway, selectedRunway)
  );
  const spawnFixes = [...dataset.procedures.fixes]
    .filter((fix) => typeof fix.latitude === "number" && typeof fix.longitude === "number")
    .filter((fix) => !fix.id.includes(" ") && !/^D\d/.test(fix.id))
    .sort((first, second) => first.id.localeCompare(second.id));
  const arrivalStreamFixes = sortedScenarioFixes(dataset, "arrival", selectedRunway);
  const departureRunwaysForPanel = departureRunwaysForRunwayMode(selectedRunway);
  const departureStreamFixesByRunway: Record<DepartureRunway, ScenarioFixRoleRecord[]> = {
    "07": sortedDepartureFixesForRunway(dataset, "07"),
    "25": sortedDepartureFixesForRunway(dataset, "25"),
    "31": sortedDepartureFixesForRunway(dataset, "31")
  };
  const aircraftCreateDepartureRunway = departureRunwaysForPanel.includes(aircraftCreateForm.departureRunway)
    ? aircraftCreateForm.departureRunway
    : departureRunwaysForPanel[0];
  const aircraftCreateDepartureFixes =
    departureStreamFixesByRunway[aircraftCreateDepartureRunway] ?? [];
  const aircraftCreateExitFix = aircraftCreateDepartureFixes.some(
    (fix) => normalizeFixId(fix.fix_id) === normalizeFixId(aircraftCreateForm.exitFix)
  )
    ? normalizeFixId(aircraftCreateForm.exitFix)
    : aircraftCreateDepartureFixes[0]?.fix_id ?? normalizeFixId(aircraftCreateForm.exitFix);
  const fixSpawnPickActive =
    aircraftCreatePanelOpen &&
    trafficPanelMode === "fix" &&
    aircraftCreateForm.phase === "arrival" &&
    aircraftCreateForm.spawnMode === "fix";
  const selectedAircraft =
    visibleAircraft.find((aircraft) => aircraft.id === selectedAircraftId) ?? visibleAircraft[0] ?? null;
  const selectedPublishedHoldFixId =
    selectedAircraft?.next_fix && holdingPatternForFix(selectedAircraft.next_fix, selectedAircraft)
      ? selectedAircraft.next_fix
      : null;
  const magneticVariationWestDeg = parseMagneticVariationWestDeg(dataset.airport.airport_meta.mag_var);
  const effectiveOverlays = effectiveScopeOverlays(surfaceMode, overlays);
  const overlayCounts = scopeOverlayCounts(effectiveOverlays);
  const atcMicHud = atcMicrophoneHudViewModel(atcSpeechStatus, atcMicLevel);

  return {
    aircraftCreateDepartureFixes,
    aircraftCreateDepartureRunway,
    aircraftCreateExitFix,
    approachCount: approaches.length,
    approaches,
    arrivalStreamFixes,
    atcMicHud,
    departureRunwaysForPanel,
    departureStreamFixesByRunway,
    effectiveOverlays,
    fixSpawnPickActive,
    magneticVariationWestDeg,
    overlayCounts,
    selectedAircraft,
    selectedPublishedHoldFixId,
    sidCount: sids.length,
    sids,
    spawnFixes,
    starCount: stars.length,
    stars,
    visibleAircraft
  };
}
