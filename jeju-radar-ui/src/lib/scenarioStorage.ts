import type {
  AircraftState,
  DensityMode,
  DepartureRunway,
  RunwayMode,
  ScopeExtentMode,
  SurfaceMode,
  WindSettings
} from "./types";

export const SCENARIO_STORAGE_LIMIT = 40;
export const SIMULATION_SPEED_OPTIONS = [1, 2, 4, 6, 8, 10] as const;

export type SimulationSpeed = (typeof SIMULATION_SPEED_OPTIONS)[number];
export type LegacyScopeExtentMode = ScopeExtentMode | "wide";

export interface ScenarioOverlayState {
  traffic: boolean;
  coastline: boolean;
  airways: boolean;
  specialUse: boolean;
  boundary: boolean;
  surveillanceBoundary: boolean;
  mva: boolean;
  guides: boolean;
  rwy31Sid: boolean;
  sidReference: boolean;
  labels: boolean;
  rings: boolean;
  secondaryRunway: boolean;
}

export interface DepartureWaveForm {
  exitFix: string;
  intervalMin: string;
  count: string;
  altitude: string;
  speed: string;
  verticalRate: string;
  aircraftType: string;
  callsignPrefix: string;
  destinationAirport: string;
}

export interface ScenarioStreamForm {
  arrivalFix: string;
  arrivalSpacingNm: string;
  arrivalAddCount: string;
  arrivalKeepBuffer: string;
  arrivalAltitude: string;
  arrivalSpeed: string;
  arrivalAircraftType: string;
  arrivalCallsignPrefix: string;
  missedApproachProbability: string;
  departure07: DepartureWaveForm;
  departure25: DepartureWaveForm;
  departure31: DepartureWaveForm;
}

export interface DepartureWave {
  id: string;
  runway: RunwayMode;
  departureRunway: DepartureRunway;
  exitFix: string;
  intervalMs: number;
  totalCount: number;
  spawnedCount: number;
  lastSpawnAtMs: number;
  aircraftType: string;
  callsignPrefix: string;
  destinationAirport: string;
  altitudeFt: number;
  speedKt: number;
  verticalRateFpm: number;
}

export interface ArrivalStream {
  id: string;
  runway: RunwayMode;
  entryFix: string;
  spacingNm: number;
  targetBufferCount: number;
  aircraftType: string;
  callsignPrefix: string;
  altitudeFt: number;
  speedKt: number;
  verticalRateFpm: number;
}

export interface ScenarioSnapshotV1 {
  version: 1;
  id: string;
  name: string;
  savedAt: string;
  runway: RunwayMode;
  radar: {
    paused: boolean;
    surfaceMode: SurfaceMode;
    densityMode: DensityMode;
    scopeExtentMode: LegacyScopeExtentMode;
    overlays: ScenarioOverlayState;
    showChrome: boolean;
    simulationSpeed?: SimulationSpeed;
  };
  aircraft: AircraftState[];
  traffic: {
    scenarioForm: ScenarioStreamForm;
    activeArrivalStreams: ArrivalStream[];
    activeDepartureWaves: DepartureWave[];
  };
  weather: {
    wind: WindSettings;
  } | null;
}

export interface SavedScenarioRecord {
  id: string;
  name: string;
  savedAt: string;
  snapshot: ScenarioSnapshotV1;
}

export interface ScenarioExportEnvelopeV1 {
  export_schema: "jeju_radar_scenario_export_v1";
  exportedAt: string;
  summary: {
    name: string;
    runway: RunwayMode;
    savedAt: string;
    aircraftCount: number;
    arrivalStreamCount: number;
    departureWaveCount: number;
  };
  snapshot: ScenarioSnapshotV1;
}

const SCENARIO_STORAGE_KEY = "jeju-radar-scenarios-v1";

export function scenarioStorageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function scenarioRecordId() {
  return `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function jsonClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function scenarioFilename(name: string) {
  const safeName = name
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "_")
    .slice(0, 64);

  return `${safeName || "jeju_scenario"}.json`;
}

export function scenarioExportFilename(snapshot: ScenarioSnapshotV1) {
  const savedAtToken = snapshot.savedAt
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/[^\dTZ]/g, "")
    .slice(0, 16);
  const runwayToken = `R${snapshot.runway}`;
  const safeName = scenarioFilename(snapshot.name).replace(/\.json$/i, "");

  return scenarioFilename([savedAtToken, runwayToken, safeName].filter(Boolean).join("_"));
}

export function scenarioExportEnvelopeForSnapshot(
  snapshot: ScenarioSnapshotV1,
  exportedAt = new Date().toISOString()
): ScenarioExportEnvelopeV1 {
  return {
    export_schema: "jeju_radar_scenario_export_v1",
    exportedAt,
    summary: {
      name: snapshot.name,
      runway: snapshot.runway,
      savedAt: snapshot.savedAt,
      aircraftCount: snapshot.aircraft.length,
      arrivalStreamCount: snapshot.traffic.activeArrivalStreams.length,
      departureWaveCount: snapshot.traffic.activeDepartureWaves.length
    },
    snapshot
  };
}

export function scenarioExportJsonForSnapshot(
  snapshot: ScenarioSnapshotV1,
  exportedAt = new Date().toISOString()
) {
  return JSON.stringify(scenarioExportEnvelopeForSnapshot(snapshot, exportedAt), null, 2);
}

export function isScenarioSnapshotV1(value: unknown): value is ScenarioSnapshotV1 {
  if (!isRecord(value)) {
    return false;
  }

  const radar = value.radar;
  const traffic = value.traffic;

  return (
    value.version === 1 &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.savedAt === "string" &&
    (value.runway === "07" || value.runway === "25") &&
    isRecord(radar) &&
    typeof radar.paused === "boolean" &&
    (radar.surfaceMode === "exact" || radar.surfaceMode === "training") &&
    (radar.densityMode === "full" || radar.densityMode === "balanced" || radar.densityMode === "declutter") &&
    (radar.scopeExtentMode === "tma" || radar.scopeExtentMode === "wide") &&
    isRecord(radar.overlays) &&
    typeof radar.showChrome === "boolean" &&
    (
      typeof radar.simulationSpeed === "undefined" ||
      SIMULATION_SPEED_OPTIONS.includes(radar.simulationSpeed as SimulationSpeed)
    ) &&
    Array.isArray(value.aircraft) &&
    isRecord(traffic) &&
    isRecord(traffic.scenarioForm) &&
    Array.isArray(traffic.activeArrivalStreams) &&
    Array.isArray(traffic.activeDepartureWaves)
  );
}

export function isSavedScenarioRecord(value: unknown): value is SavedScenarioRecord {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.savedAt === "string" &&
    isScenarioSnapshotV1(value.snapshot)
  );
}

export function loadSavedScenarioRecords() {
  if (!scenarioStorageAvailable()) {
    return [];
  }

  try {
    const rawScenarios = window.localStorage.getItem(SCENARIO_STORAGE_KEY);
    const parsedScenarios = rawScenarios ? JSON.parse(rawScenarios) : [];

    return Array.isArray(parsedScenarios)
      ? parsedScenarios.filter(isSavedScenarioRecord).slice(0, SCENARIO_STORAGE_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function persistSavedScenarioRecords(records: SavedScenarioRecord[]) {
  if (!scenarioStorageAvailable()) {
    return;
  }

  window.localStorage.setItem(SCENARIO_STORAGE_KEY, JSON.stringify(records));
}

export function normalizeImportedScenarioSnapshot(value: unknown) {
  const candidate =
    isRecord(value) && value.export_schema === "jeju_radar_scenario_export_v1" && isScenarioSnapshotV1(value.snapshot)
      ? value.snapshot
      : isRecord(value) && isScenarioSnapshotV1(value.snapshot)
        ? value.snapshot
        : value;

  return isScenarioSnapshotV1(candidate) ? candidate : null;
}

export function retimeTimestamp(timestampMs: number | undefined, deltaMs: number) {
  return typeof timestampMs === "number" ? timestampMs + deltaMs : undefined;
}

export function normalizeDepartureRunway(value: unknown, runwayMode: RunwayMode = "07"): DepartureRunway {
  if (value === "07" || value === "25" || value === "31") {
    return value;
  }

  return runwayMode === "25" ? "25" : "07";
}

export function runwayModeForDepartureRunway(departureRunway: DepartureRunway): RunwayMode {
  return departureRunway === "07" ? "07" : "25";
}

export function retimeAircraftForScenarioLoad(aircraft: AircraftState, deltaMs: number): AircraftState {
  return {
    ...aircraft,
    assigned: aircraft.assigned ? { ...aircraft.assigned } : undefined,
    turn_state: aircraft.turn_state ? { ...aircraft.turn_state } : undefined,
    departure_roll: aircraft.departure_roll ? { ...aircraft.departure_roll } : undefined,
    pilot_first_contact: aircraft.pilot_first_contact
      ? {
          ...aircraft.pilot_first_contact,
          contacted_at_ms: retimeTimestamp(aircraft.pilot_first_contact.contacted_at_ms, deltaMs),
          last_jammed_at_ms: retimeTimestamp(aircraft.pilot_first_contact.last_jammed_at_ms, deltaMs),
          retry_after_ms: retimeTimestamp(aircraft.pilot_first_contact.retry_after_ms, deltaMs)
        }
      : undefined,
    guidance_active_at_ms: retimeTimestamp(aircraft.guidance_active_at_ms, deltaMs),
    heading_active_at_ms: retimeTimestamp(aircraft.heading_active_at_ms, deltaMs),
    speed_active_at_ms: retimeTimestamp(aircraft.speed_active_at_ms, deltaMs),
    altitude_active_at_ms: retimeTimestamp(aircraft.altitude_active_at_ms, deltaMs),
    vertical_rate_active_at_ms: retimeTimestamp(aircraft.vertical_rate_active_at_ms, deltaMs)
  };
}

export function retimeDepartureWaveForScenarioLoad(wave: DepartureWave, deltaMs: number): DepartureWave {
  const departureRunway = normalizeDepartureRunway(
    (wave as DepartureWave & { departureRunway?: unknown }).departureRunway,
    wave.runway
  );

  return {
    ...wave,
    runway: runwayModeForDepartureRunway(departureRunway),
    departureRunway,
    lastSpawnAtMs: wave.lastSpawnAtMs + deltaMs
  };
}
