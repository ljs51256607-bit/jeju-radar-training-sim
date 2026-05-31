import {
  isRecord,
  type DepartureWaveForm,
  type ScenarioStreamForm
} from "./scenarioStorage";
import type {
  DepartureRunway,
  RadarDataset,
  RunwayMode,
  ScenarioFixRoleRecord
} from "./types";

export const DEPARTURE_ROLL_INITIAL_ALTITUDE_FT = 0;
export const DEPARTURE_ROLL_INITIAL_SPEED_KT = 0;
export const DEPARTURE_RELEASE_ALTITUDE_FT = 1000;
export const DEPARTURE_RELEASE_SPEED_KT = 180;
export const DEPARTURE_ROLL_ACCEL_KT_SEC = 5;
export const DEPARTURE_TARGET_ALTITUDE_FT = 10000;
export const DEPARTURE_INITIAL_VERTICAL_RATE_FPM = 2200;
export const DEPARTURE_BELOW_10000_TARGET_SPEED_KT = 250;

const autoCallsignTokens = new Set(["", "AUTO", "RAND", "RANDOM"]);
const koreanAirlineCallsignPrefixes = [
  "KAL",
  "AAR",
  "JJA",
  "JNA",
  "TWB",
  "ESR",
  "ABL",
  "ASV",
  "EOK"
];

export interface AircraftCreateForm {
  callsign: string;
  aircraftType: string;
  phase: "arrival" | "departure";
  spawnMode: "fix" | "map";
  positionFix: string;
  heading: string;
  speed: string;
  altitude: string;
  verticalRate: string;
  squawk: string;
  arrivalAirport: string;
  destinationAirport: string;
  departureRunway: DepartureRunway;
  exitFix: string;
  scratchpad: string;
}

export interface MapSpawnPoint {
  latitude: number;
  longitude: number;
}

export function normalizeFixId(fixId: string) {
  return fixId.trim().toUpperCase();
}

export function directScratchpad(fixId: string) {
  const normalizedFixId = normalizeFixId(fixId);
  const pcNumberFix = normalizedFixId.match(/^PC(\d+)$/);

  if (pcNumberFix) {
    return pcNumberFix[1];
  }

  return normalizedFixId.slice(0, 3);
}

export function normalizeScratchpadText(value: string) {
  return value.trim().replace(/\s+/g, " ").toUpperCase();
}

export function sanitizeCallsignInput(value: string) {
  return normalizeScratchpadText(value).replace(/[^A-Z0-9]/g, "");
}

export function callsignInputIsAuto(value: string) {
  return autoCallsignTokens.has(sanitizeCallsignInput(value));
}

function randomInteger(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomCallsignNumber() {
  return Math.random() < 0.65 ? String(randomInteger(100, 999)) : String(randomInteger(1000, 9999));
}

export function nextRandomKoreanAirlineCallsign(existingAircraft: { callsign: string }[]) {
  const usedCallsigns = new Set(existingAircraft.map((aircraft) => sanitizeCallsignInput(aircraft.callsign)));

  for (let attempt = 0; attempt < 2000; attempt += 1) {
    const prefix = koreanAirlineCallsignPrefixes[randomInteger(0, koreanAirlineCallsignPrefixes.length - 1)];
    const candidate = `${prefix}${randomCallsignNumber()}`;

    if (!usedCallsigns.has(candidate)) {
      return candidate;
    }
  }

  return `SIM${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

export function nextUniqueCallsign(
  prefix: string,
  existingAircraft: { callsign: string }[],
  offset: number
) {
  if (callsignInputIsAuto(prefix)) {
    return nextRandomKoreanAirlineCallsign(existingAircraft);
  }

  const normalizedPrefix = sanitizeCallsignInput(prefix || "SIM") || "SIM";
  const usedCallsigns = new Set(existingAircraft.map((aircraft) => sanitizeCallsignInput(aircraft.callsign)));
  let sequence = Math.max(1, offset + 1);

  while (sequence < 10000) {
    const candidate = `${normalizedPrefix}${String(sequence).padStart(sequence < 1000 ? 3 : 4, "0")}`;

    if (!usedCallsigns.has(candidate)) {
      return candidate;
    }

    sequence += 1;
  }

  return `${normalizedPrefix}${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

export function callsignForCreateInput(value: string, existingAircraft: { callsign: string }[]) {
  if (callsignInputIsAuto(value)) {
    return nextRandomKoreanAirlineCallsign(existingAircraft);
  }

  return sanitizeCallsignInput(value);
}

export function squawkForSequence(seed: number) {
  const code = 4200 + (seed % 300);

  return String(code).padStart(4, "0");
}

export function defaultAircraftCreateForm(
  phase: AircraftCreateForm["phase"] = "arrival"
): AircraftCreateForm {
  return {
    callsign: "AUTO",
    aircraftType: phase === "departure" ? "A321" : "B738",
    phase,
    spawnMode: "fix",
    positionFix: phase === "departure" ? "" : "DOTOL",
    heading: phase === "departure" ? "070" : "230",
    speed: phase === "departure" ? String(DEPARTURE_BELOW_10000_TARGET_SPEED_KT) : "220",
    altitude: phase === "departure" ? "A100" : "A120",
    verticalRate: phase === "departure" ? String(DEPARTURE_INITIAL_VERTICAL_RATE_FPM) : "-700",
    squawk: phase === "departure" ? "4231" : "7214",
    arrivalAirport: "RKPC",
    destinationAirport: "RKSS",
    departureRunway: "07",
    exitFix: "AKPON",
    scratchpad: ""
  };
}

export function defaultDepartureWaveForm(exitFix = "KAMIT"): DepartureWaveForm {
  return {
    exitFix,
    intervalMin: "3",
    count: "3",
    altitude: "A100",
    speed: String(DEPARTURE_BELOW_10000_TARGET_SPEED_KT),
    verticalRate: String(DEPARTURE_INITIAL_VERTICAL_RATE_FPM),
    aircraftType: "A321",
    callsignPrefix: "AUTO",
    destinationAirport: "RKSS"
  };
}

export function defaultScenarioStreamForm(): ScenarioStreamForm {
  return {
    arrivalFix: "DOTOL",
    arrivalSpacingNm: "12",
    arrivalAddCount: "4",
    arrivalKeepBuffer: "4",
    arrivalAltitude: "F150",
    arrivalSpeed: "AUTO",
    arrivalAircraftType: "B738",
    arrivalCallsignPrefix: "AUTO",
    missedApproachProbability: "0",
    departure07: defaultDepartureWaveForm("KAMIT"),
    departure25: defaultDepartureWaveForm("KAMIT"),
    departure31: defaultDepartureWaveForm("KAMIT")
  };
}

function stringFromRecord(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function departureWaveFormFromRecord(value: unknown, fallback: DepartureWaveForm): DepartureWaveForm {
  const record = isRecord(value) ? value : {};

  return {
    exitFix: stringFromRecord(record.exitFix, fallback.exitFix),
    intervalMin: stringFromRecord(record.intervalMin, fallback.intervalMin),
    count: stringFromRecord(record.count, fallback.count),
    altitude: stringFromRecord(record.altitude, fallback.altitude),
    speed: stringFromRecord(record.speed, fallback.speed),
    verticalRate: stringFromRecord(record.verticalRate, fallback.verticalRate),
    aircraftType: stringFromRecord(record.aircraftType, fallback.aircraftType),
    callsignPrefix: stringFromRecord(record.callsignPrefix, fallback.callsignPrefix),
    destinationAirport: stringFromRecord(record.destinationAirport, fallback.destinationAirport)
  };
}

export function normalizeScenarioStreamForm(
  value: unknown,
  runwayMode: RunwayMode = "07"
): ScenarioStreamForm {
  const defaults = defaultScenarioStreamForm();
  const record = isRecord(value) ? value : {};
  const legacyDeparture = {
    exitFix: stringFromRecord(record.departureExitFix, defaults.departure07.exitFix),
    intervalMin: stringFromRecord(record.departureIntervalMin, defaults.departure07.intervalMin),
    count: stringFromRecord(record.departureCount, defaults.departure07.count),
    altitude: stringFromRecord(record.departureAltitude, defaults.departure07.altitude),
    speed: stringFromRecord(record.departureSpeed, defaults.departure07.speed),
    verticalRate: stringFromRecord(record.departureVerticalRate, defaults.departure07.verticalRate),
    aircraftType: stringFromRecord(record.departureAircraftType, defaults.departure07.aircraftType),
    callsignPrefix: stringFromRecord(record.departureCallsignPrefix, defaults.departure07.callsignPrefix),
    destinationAirport: stringFromRecord(
      record.departureDestinationAirport,
      defaults.departure07.destinationAirport
    )
  };

  return {
    arrivalFix: stringFromRecord(record.arrivalFix, defaults.arrivalFix),
    arrivalSpacingNm: stringFromRecord(record.arrivalSpacingNm, defaults.arrivalSpacingNm),
    arrivalAddCount: stringFromRecord(record.arrivalAddCount, defaults.arrivalAddCount),
    arrivalKeepBuffer: stringFromRecord(record.arrivalKeepBuffer, defaults.arrivalKeepBuffer),
    arrivalAltitude: stringFromRecord(record.arrivalAltitude, defaults.arrivalAltitude),
    arrivalSpeed: stringFromRecord(record.arrivalSpeed, defaults.arrivalSpeed),
    arrivalAircraftType: stringFromRecord(record.arrivalAircraftType, defaults.arrivalAircraftType),
    arrivalCallsignPrefix: stringFromRecord(record.arrivalCallsignPrefix, defaults.arrivalCallsignPrefix),
    missedApproachProbability: stringFromRecord(
      record.missedApproachProbability,
      defaults.missedApproachProbability
    ),
    departure07: departureWaveFormFromRecord(
      record.departure07,
      runwayMode === "07" ? legacyDeparture : defaults.departure07
    ),
    departure25: departureWaveFormFromRecord(
      record.departure25,
      runwayMode === "25" ? legacyDeparture : defaults.departure25
    ),
    departure31: departureWaveFormFromRecord(record.departure31, defaults.departure31)
  };
}

export function parsePositiveInteger(value: string, min: number, max: number) {
  const numeric = Number(value);

  if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
    return null;
  }

  return numeric;
}

export function parsePositiveNumber(value: string, min: number, max: number) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    return null;
  }

  return numeric;
}

export function runwayIdVisibleForRunwayMode(targetRunway: string | undefined, runwayMode: RunwayMode) {
  if (!targetRunway) {
    return true;
  }

  if (targetRunway === runwayMode) {
    return true;
  }

  return runwayMode === "25" && targetRunway === "31";
}

export function runwayListAppliesToMode(runways: string[], runwayMode: RunwayMode) {
  return runways.length === 0 || runways.some((runway) => runwayIdVisibleForRunwayMode(runway, runwayMode));
}

export function roleFixIsUsableForRunway(
  roleFix: ScenarioFixRoleRecord,
  role: "arrival" | "departure",
  runway: RunwayMode
) {
  const roleDetail = roleFix[role];

  return roleDetail.enabled && runwayListAppliesToMode(roleDetail.runways, runway);
}

export function sortedScenarioFixes(
  dataset: RadarDataset,
  role: "arrival" | "departure",
  runway: RunwayMode
) {
  return [...dataset.scenarioFixRoles.fixes]
    .filter((fix) => roleFixIsUsableForRunway(fix, role, runway))
    .sort((first, second) => first.fix_id.localeCompare(second.fix_id));
}

export function sortedDepartureFixesForRunway(dataset: RadarDataset, departureRunway: DepartureRunway) {
  return [...dataset.scenarioFixRoles.fixes]
    .filter(
      (fix) =>
        fix.departure.enabled &&
        fix.departure.runways.some((runway) => runway === departureRunway)
    )
    .sort((first, second) => first.fix_id.localeCompare(second.fix_id));
}

export function departureRunwaysForRunwayMode(runwayMode: RunwayMode): DepartureRunway[] {
  return runwayMode === "07" ? ["07"] : ["25", "31"];
}

export function departureFixIdAppliesToRunway(
  dataset: RadarDataset,
  departureRunway: DepartureRunway,
  exitFix: string
) {
  const normalizedExitFix = normalizeFixId(exitFix);

  return sortedDepartureFixesForRunway(dataset, departureRunway).some(
    (fix) => normalizeFixId(fix.fix_id) === normalizedExitFix
  );
}

export function firstAvailableDepartureFixId(
  dataset: RadarDataset,
  departureRunway: DepartureRunway,
  preferredExitFix: string
) {
  const normalizedPreferredExitFix = normalizeFixId(preferredExitFix);

  if (departureFixIdAppliesToRunway(dataset, departureRunway, normalizedPreferredExitFix)) {
    return normalizedPreferredExitFix;
  }

  return sortedDepartureFixesForRunway(dataset, departureRunway)[0]?.fix_id ?? normalizedPreferredExitFix;
}
