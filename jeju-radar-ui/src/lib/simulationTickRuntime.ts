import {
  destinationPoint,
  distanceNmBetweenPoints,
  distanceNmForSeconds,
  initialBearingTrueDeg
} from "./aircraftMotion";
import { runwayForMode } from "./aircraftFactory";
import {
  guideAircraftAlongRoute,
  resolveDirectFix
} from "./procedureGuidance";
import {
  DEPARTURE_BELOW_10000_TARGET_SPEED_KT,
  DEPARTURE_INITIAL_VERTICAL_RATE_FPM,
  DEPARTURE_TARGET_ALTITUDE_FT
} from "./scenarioTraffic";
import type { SimulationSpeed } from "./scenarioStorage";
import type {
  AircraftCommandKind,
  AircraftPerformanceProfile,
  AircraftState,
  RadarDataset,
  WindSettings
} from "./types";

export const RADAR_UPDATE_INTERVAL_MS = 3000;
export const RADAR_UPDATE_INTERVAL_SECONDS = RADAR_UPDATE_INTERVAL_MS / 1000;
export const LANDED_RETENTION_MS = 9000;

export function aircraftPerformanceProfile(
  dataset: RadarDataset,
  aircraft: AircraftState
): AircraftPerformanceProfile | undefined {
  const aircraftType = aircraft.aircraft_type.toUpperCase();
  const typeMatchedProfile = dataset.aircraftPerformanceProfiles.profiles.find((profile) =>
    profile.aircraft_types.some((type) => type.toUpperCase() === aircraftType)
  );

  if (typeMatchedProfile) {
    return typeMatchedProfile;
  }

  return dataset.aircraftPerformanceProfiles.profiles.find(
    (profile) => profile.id === dataset.aircraftPerformanceProfiles.default_profile_id
  );
}

export function approachNumber(current: number, target: number, maxStep: number) {
  if (Math.abs(target - current) <= maxStep) {
    return target;
  }

  return current + Math.sign(target - current) * maxStep;
}

export function advanceDepartureTakeoffRoll(
  aircraft: AircraftState,
  dataset: RadarDataset,
  elapsedSeconds: number,
  currentTimeMs: number
): AircraftState {
  const roll = aircraft.departure_roll;

  if (!roll?.active) {
    return aircraft;
  }

  const runway = runwayForMode(dataset, roll.runway);
  const runwayHeadingTrue = runway?.true_bearing_deg ?? aircraft.heading_true_deg;
  const distanceToEndNm = distanceNmBetweenPoints(
    aircraft.latitude,
    aircraft.longitude,
    roll.end_latitude,
    roll.end_longitude
  );
  const nextSpeedKt = approachNumber(
    aircraft.ground_speed_kt,
    roll.release_speed_kt,
    Math.max(0, roll.accel_kt_sec * elapsedSeconds)
  );
  const averageSpeedKt = (aircraft.ground_speed_kt + nextSpeedKt) / 2;
  const rollDistanceNm = distanceNmForSeconds(averageSpeedKt, elapsedSeconds);

  if (distanceToEndNm <= Math.max(0.001, rollDistanceNm)) {
    const firstTargetFix = aircraft.next_fix ? resolveDirectFix(dataset, aircraft.next_fix) : null;
    const headingToFirstFix = firstTargetFix
      ? initialBearingTrueDeg(
          roll.end_latitude,
          roll.end_longitude,
          firstTargetFix.latitude,
          firstTargetFix.longitude
        )
      : aircraft.assigned?.heading_true_deg ?? runwayHeadingTrue;

    return {
      ...aircraft,
      latitude: roll.end_latitude,
      longitude: roll.end_longitude,
      heading_true_deg: runwayHeadingTrue,
      indicated_speed_kt: Math.max(nextSpeedKt, roll.release_speed_kt),
      ground_speed_kt: Math.max(nextSpeedKt, roll.release_speed_kt),
      altitude_ft: roll.release_altitude_ft,
      vertical_rate_fpm: aircraft.assigned?.vertical_rate_fpm ?? DEPARTURE_INITIAL_VERTICAL_RATE_FPM,
      departure_roll: undefined,
      guidance_active_at_ms: currentTimeMs,
      heading_active_at_ms: currentTimeMs,
      assigned: {
        ...aircraft.assigned,
        heading_true_deg: headingToFirstFix,
        speed_kt: aircraft.assigned?.speed_kt ?? DEPARTURE_BELOW_10000_TARGET_SPEED_KT,
        altitude_ft: aircraft.assigned?.altitude_ft ?? DEPARTURE_TARGET_ALTITUDE_FT,
        vertical_rate_fpm: aircraft.assigned?.vertical_rate_fpm ?? DEPARTURE_INITIAL_VERTICAL_RATE_FPM
      },
      speed_control_mode: aircraft.speed_control_mode ?? "managed",
      managed_speed_kt: aircraft.managed_speed_kt ?? DEPARTURE_BELOW_10000_TARGET_SPEED_KT
    };
  }

  const nextPosition = destinationPoint(
    aircraft.latitude,
    aircraft.longitude,
    runwayHeadingTrue,
    rollDistanceNm
  );
  const remainingDistanceNm = Math.max(0, distanceToEndNm - rollDistanceNm);
  const rollProgress =
    roll.total_distance_nm > 0
      ? Math.min(1, Math.max(0, 1 - remainingDistanceNm / roll.total_distance_nm))
      : 0;
  const nextAltitudeFt = Math.round(roll.release_altitude_ft * rollProgress);
  const nextVerticalRateFpm =
    elapsedSeconds > 0 ? Math.round(((nextAltitudeFt - aircraft.altitude_ft) / elapsedSeconds) * 60) : 0;

  return {
    ...aircraft,
    latitude: nextPosition.latitude,
    longitude: nextPosition.longitude,
    heading_true_deg: runwayHeadingTrue,
    indicated_speed_kt: nextSpeedKt,
    ground_speed_kt: nextSpeedKt,
    altitude_ft: nextAltitudeFt,
    vertical_rate_fpm: nextVerticalRateFpm,
    assigned: {
      ...aircraft.assigned,
      heading_true_deg: runwayHeadingTrue
    }
  };
}

export function radarTickIntervalMs(speed: SimulationSpeed) {
  return RADAR_UPDATE_INTERVAL_MS / speed;
}

export function formatRadarTickInterval(speed: SimulationSpeed) {
  const tickSeconds = radarTickIntervalMs(speed) / 1000;

  return tickSeconds >= 1 ? tickSeconds.toFixed(1) : tickSeconds.toFixed(2);
}

export function advanceAircraftForSimulationTick(
  aircraft: AircraftState,
  dataset: RadarDataset,
  currentTimeMs: number,
  options: { wind?: WindSettings } = {}
) {
  if (aircraft.landing_state === "landed") {
    return aircraft;
  }

  if (aircraft.departure_roll?.active) {
    return advanceDepartureTakeoffRoll(
      aircraft,
      dataset,
      RADAR_UPDATE_INTERVAL_SECONDS,
      currentTimeMs
    );
  }

  return guideAircraftAlongRoute(
    aircraft,
    dataset,
    RADAR_UPDATE_INTERVAL_SECONDS,
    {
      currentTimeMs,
      performance: aircraftPerformanceProfile(dataset, aircraft),
      wind: options.wind
    }
  );
}

export function commandActivationTimeMs(
  dataset: RadarDataset | null,
  command: AircraftCommandKind,
  issuedAtMs = Date.now()
) {
  const delayProfile = dataset?.commandDelayProfiles.profiles.find(
    (profile) => profile.command === command
  );
  const delaySeconds = delayProfile?.nominal_delay_sec ?? 0;

  return issuedAtMs + delaySeconds * 1000;
}
