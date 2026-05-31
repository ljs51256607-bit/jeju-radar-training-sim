import {
  parseAltitudeInput,
  parseSpeedInput,
  parseVerticalRateInput
} from "./aircraftControlPanel";
import {
  createDepartureWaveAircraft
} from "./aircraftFactory";
import { randomArrivalEntrySpeedKt } from "./flightProfileGuidance";
import { resolveDirectFix } from "./procedureGuidance";
import {
  matchingStarForEntryFix,
  procedureRouteFromRecord
} from "./procedureRouteUtils";
import {
  DEPARTURE_BELOW_10000_TARGET_SPEED_KT,
  DEPARTURE_TARGET_ALTITUDE_FT,
  departureFixIdAppliesToRunway,
  normalizeFixId,
  normalizeScratchpadText,
  parsePositiveInteger,
  parsePositiveNumber
} from "./scenarioTraffic";
import {
  runwayModeForDepartureRunway,
  type ArrivalStream,
  type DepartureWave,
  type DepartureWaveForm,
  type ScenarioStreamForm
} from "./scenarioStorage";
import type {
  AircraftState,
  DepartureRunway,
  ProcedureRecord,
  RadarDataset,
  RunwayMode
} from "./types";

export interface ArrivalStreamDraftArgs {
  dataset: RadarDataset;
  form: ScenarioStreamForm;
  selectedRunway: RunwayMode;
  stars: ProcedureRecord[];
  targetBufferCount: number;
  streamId: string;
}

export type ArrivalStreamDraftResult =
  | { status: "created"; stream: ArrivalStream }
  | { status: "error"; message: string };

export interface DepartureWaveStartDraftArgs {
  dataset: RadarDataset;
  form: DepartureWaveForm;
  departureRunway: DepartureRunway;
  existingAircraft: AircraftState[];
  nowMs: number;
}

export type DepartureWaveStartDraftResult =
  | {
      status: "created";
      wave: DepartureWave;
      firstAircraft: AircraftState;
      queuedWave?: DepartureWave;
    }
  | { status: "error"; message: string };

export function parseArrivalAddCount(form: ScenarioStreamForm) {
  return parsePositiveInteger(form.arrivalAddCount, 1, 20);
}

export function parseArrivalKeepBuffer(form: ScenarioStreamForm) {
  return parsePositiveInteger(form.arrivalKeepBuffer, 1, 20);
}

export function buildArrivalStreamDraft({
  dataset,
  form,
  selectedRunway,
  stars,
  targetBufferCount,
  streamId
}: ArrivalStreamDraftArgs): ArrivalStreamDraftResult {
  const entryFixId = normalizeFixId(form.arrivalFix);
  const entryFix = resolveDirectFix(dataset, entryFixId);
  const spacingNm = parsePositiveNumber(form.arrivalSpacingNm, 3, 80);
  const altitude = parseAltitudeInput(form.arrivalAltitude);
  const arrivalSpeedInput = form.arrivalSpeed.trim().toUpperCase();
  const speed =
    arrivalSpeedInput === "" || arrivalSpeedInput === "AUTO"
      ? randomArrivalEntrySpeedKt(dataset)
      : parseSpeedInput(form.arrivalSpeed);
  const aircraftType = normalizeScratchpadText(form.arrivalAircraftType);
  const callsignPrefix = normalizeScratchpadText(form.arrivalCallsignPrefix || "AUTO");

  if (!entryFix) {
    return { status: "error", message: `${entryFixId || "ENTRY"} 좌표 없음` };
  }

  if (spacingNm === null) {
    return { status: "error", message: "입항 간격은 3-80NM 숫자" };
  }

  if (altitude === null) {
    return { status: "error", message: "입항 ALT는 A120, F150, 15000 형식" };
  }

  if (speed === null) {
    return { status: "error", message: "입항 SPD는 AUTO 또는 2-3자리 숫자: 28=280, 250=250" };
  }

  if (!aircraftType) {
    return { status: "error", message: "입항 TYPE 필요" };
  }

  const star = matchingStarForEntryFix(stars, entryFixId);
  const route = star ? procedureRouteFromRecord(star, "STAR") : [entryFixId];
  const routeHasMissingFix = route.some((fixId) => !resolveDirectFix(dataset, fixId));

  if (routeHasMissingFix) {
    return { status: "error", message: `${entryFixId} STAR route 좌표 누락` };
  }

  return {
    status: "created",
    stream: {
      id: streamId,
      runway: selectedRunway,
      entryFix: entryFixId,
      spacingNm,
      targetBufferCount,
      aircraftType,
      callsignPrefix,
      altitudeFt: altitude,
      speedKt: speed,
      verticalRateFpm: -700
    }
  };
}

export function buildDepartureWaveStartDraft({
  dataset,
  form,
  departureRunway,
  existingAircraft,
  nowMs
}: DepartureWaveStartDraftArgs): DepartureWaveStartDraftResult {
  const runwayMode = runwayModeForDepartureRunway(departureRunway);
  const exitFix = normalizeFixId(form.exitFix);
  const exitTarget = resolveDirectFix(dataset, exitFix);
  const exitAppliesToRunway = departureFixIdAppliesToRunway(dataset, departureRunway, exitFix);
  const intervalMin = parsePositiveNumber(form.intervalMin, 0.5, 30);
  const count = parsePositiveInteger(form.count, 1, 20);
  const altitude = parseAltitudeInput(form.altitude);
  const speed = parseSpeedInput(form.speed);
  const verticalRate = parseVerticalRateInput(form.verticalRate);
  const aircraftType = normalizeScratchpadText(form.aircraftType);
  const callsignPrefix = normalizeScratchpadText(form.callsignPrefix || "AUTO");
  const destinationAirport = normalizeScratchpadText(form.destinationAirport || "RKSS");

  if (!exitTarget) {
    return { status: "error", message: `${exitFix || "EXIT"} 좌표 없음` };
  }

  if (!exitAppliesToRunway) {
    return { status: "error", message: `RWY${departureRunway} ${exitFix || "EXIT"} 출항 FIX 사용 불가` };
  }

  if (intervalMin === null) {
    return { status: "error", message: "출항 간격은 0.5-30분 숫자" };
  }

  if (count === null) {
    return { status: "error", message: "출항 대수는 1-20" };
  }

  if (altitude === null) {
    return { status: "error", message: "출항 ALT는 A006, A050, 5000 형식" };
  }

  if (speed === null) {
    return { status: "error", message: "출항 SPD는 2-3자리 숫자: 25=250, 305=305" };
  }

  if (verticalRate === null) {
    return { status: "error", message: "출항 VS는 -6000~6000 숫자" };
  }

  if (!aircraftType) {
    return { status: "error", message: "출항 TYPE 필요" };
  }

  if (!destinationAirport) {
    return { status: "error", message: "출항 DEST 필요" };
  }

  const wave: DepartureWave = {
    id: `WAVE-${departureRunway}-${nowMs.toString(36).toUpperCase()}`,
    runway: runwayMode,
    departureRunway,
    exitFix,
    intervalMs: intervalMin * 60 * 1000,
    totalCount: count,
    spawnedCount: 0,
    lastSpawnAtMs: nowMs,
    aircraftType,
    callsignPrefix,
    destinationAirport,
    altitudeFt: DEPARTURE_TARGET_ALTITUDE_FT,
    speedKt: DEPARTURE_BELOW_10000_TARGET_SPEED_KT,
    verticalRateFpm: verticalRate
  };
  const firstAircraft = createDepartureWaveAircraft(
    dataset,
    wave,
    existingAircraft,
    existingAircraft.length + 1,
    nowMs
  );

  if (!firstAircraft) {
    return { status: "error", message: `RWY${departureRunway} ${exitFix} 출항 route 좌표 없음` };
  }

  return {
    status: "created",
    wave,
    firstAircraft,
    queuedWave:
      count > 1
        ? {
            ...wave,
            spawnedCount: 1,
            lastSpawnAtMs: nowMs
          }
        : undefined
  };
}
