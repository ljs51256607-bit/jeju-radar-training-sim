import { distanceNmForSeconds } from "./aircraftMotion";
import type { AircraftState } from "./types";

export const SPEED_LOOKAHEAD_DECEL_KT_SEC = 0.6;
export const SPEED_LOOKAHEAD_ACCEL_KT_SEC = 0.3;
export const SPEED_LOOKAHEAD_BUFFER_SEC = 10;
export const SPEED_LOOKAHEAD_BUFFER_NM = 1;
export const SPEED_FIX_CAPTURE_NM = 0.5;

export function currentIndicatedSpeedKt(aircraft: AircraftState) {
  if (typeof aircraft.indicated_speed_kt === "number" && Number.isFinite(aircraft.indicated_speed_kt)) {
    return Math.max(0, aircraft.indicated_speed_kt);
  }

  return Math.max(0, aircraft.ground_speed_kt);
}

export function speedTargetForAutomation(aircraft: AircraftState, fallbackSpeedKt: number) {
  if (typeof aircraft.execution_speed_kt === "number" && Number.isFinite(aircraft.execution_speed_kt)) {
    return aircraft.execution_speed_kt;
  }

  if (
    aircraft.controller_speed_policy &&
    typeof aircraft.controller_speed_policy.speed_kt === "number" &&
    Number.isFinite(aircraft.controller_speed_policy.speed_kt)
  ) {
    if (aircraft.controller_speed_policy.type === "minimum") {
      return Math.max(fallbackSpeedKt, aircraft.controller_speed_policy.speed_kt);
    }

    if (aircraft.controller_speed_policy.type === "maximum") {
      return Math.min(fallbackSpeedKt, aircraft.controller_speed_policy.speed_kt);
    }

    if (aircraft.controller_speed_policy.type === "minimum_practical") {
      return Math.min(fallbackSpeedKt, aircraft.controller_speed_policy.speed_kt);
    }

    return aircraft.controller_speed_policy.speed_kt;
  }

  if (typeof aircraft.assigned?.speed_kt === "number" && Number.isFinite(aircraft.assigned.speed_kt)) {
    return aircraft.assigned.speed_kt;
  }

  return fallbackSpeedKt;
}

export function requiredSpeedReductionDistanceNm(
  currentSpeedKt: number,
  targetSpeedKt: number,
  groundSpeedKt: number
) {
  const speedDeltaKt = currentSpeedKt - targetSpeedKt;

  if (speedDeltaKt <= 1) {
    return 0;
  }

  const seconds = speedDeltaKt / SPEED_LOOKAHEAD_DECEL_KT_SEC + SPEED_LOOKAHEAD_BUFFER_SEC;

  return distanceNmForSeconds(Math.max(currentSpeedKt, groundSpeedKt, 1), seconds) + SPEED_LOOKAHEAD_BUFFER_NM;
}

export function procedureSpeedRestrictionShouldActivate(
  aircraft: AircraftState,
  targetSpeedKt: number,
  distanceToFixNm: number
) {
  if (!Number.isFinite(targetSpeedKt) || !Number.isFinite(distanceToFixNm)) {
    return false;
  }

  if (distanceToFixNm <= SPEED_FIX_CAPTURE_NM) {
    return true;
  }

  const currentSpeedKt = currentIndicatedSpeedKt(aircraft);

  return (
    distanceToFixNm <=
    requiredSpeedReductionDistanceNm(currentSpeedKt, targetSpeedKt, aircraft.ground_speed_kt)
  );
}

export function speedAdjustedPlanningTime(
  aircraft: AircraftState,
  targetSpeedKt: number | undefined,
  distanceNm: number | undefined
) {
  const currentIndicatedSpeed = currentIndicatedSpeedKt(aircraft);

  if (
    typeof distanceNm !== "number" ||
    !Number.isFinite(distanceNm) ||
    distanceNm <= 0.1 ||
    typeof targetSpeedKt !== "number" ||
    !Number.isFinite(targetSpeedKt) ||
    Math.abs(targetSpeedKt - currentIndicatedSpeed) <= 1 ||
    !Number.isFinite(aircraft.ground_speed_kt)
  ) {
    return undefined;
  }

  const speedDeltaKt = targetSpeedKt - currentIndicatedSpeed;
  const speedChangeKt = Math.abs(speedDeltaKt);
  const rateKtSec = speedDeltaKt < 0 ? SPEED_LOOKAHEAD_DECEL_KT_SEC : SPEED_LOOKAHEAD_ACCEL_KT_SEC;
  const bufferSeconds = speedDeltaKt < 0 ? SPEED_LOOKAHEAD_BUFFER_SEC : 0;
  const speedChangeSeconds = speedChangeKt / rateKtSec + bufferSeconds;
  const targetGroundSpeedKt = Math.max(60, aircraft.ground_speed_kt + speedDeltaKt);
  const averageSpeedChangeGroundSpeedKt = Math.max(60, (aircraft.ground_speed_kt + targetGroundSpeedKt) / 2);
  const speedChangeDistanceNm = distanceNmForSeconds(averageSpeedChangeGroundSpeedKt, speedChangeSeconds);

  if (speedChangeDistanceNm >= distanceNm) {
    return {
      minutes: distanceNm / (averageSpeedChangeGroundSpeedKt / 60),
      speedAdjustmentDistanceNm: distanceNm
    };
  }

  return {
    minutes: speedChangeSeconds / 60 + (distanceNm - speedChangeDistanceNm) / (targetGroundSpeedKt / 60),
    speedAdjustmentDistanceNm: speedChangeDistanceNm
  };
}
