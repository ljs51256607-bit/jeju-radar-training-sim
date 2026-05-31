import type { AircraftGuidancePlan } from "./aircraftGuidancePlanner";
import type { AircraftState } from "./types";

export function applyAircraftGuidanceExecution(
  aircraft: AircraftState,
  plan: AircraftGuidancePlan
): AircraftState {
  let nextAircraft = applyPlannedSpeedExecution(aircraft, plan);
  nextAircraft = applyPlannedVerticalExecution(nextAircraft, plan);

  return nextAircraft;
}

function applyPlannedSpeedExecution(
  aircraft: AircraftState,
  plan: AircraftGuidancePlan
): AircraftState {
  const targetSpeedKt = plan.speed.target_speed_kt;

  if (typeof targetSpeedKt !== "number" || !Number.isFinite(targetSpeedKt)) {
    return aircraft;
  }

  const existingExecutionSpeedKt =
    typeof aircraft.execution_speed_kt === "number" && Number.isFinite(aircraft.execution_speed_kt)
      ? aircraft.execution_speed_kt
      : targetSpeedKt;

  return {
    ...aircraft,
    execution_speed_kt: Math.min(existingExecutionSpeedKt, targetSpeedKt),
    managed_speed_kt:
      aircraft.speed_control_mode === "controller"
        ? aircraft.managed_speed_kt
        : Math.min(aircraft.managed_speed_kt ?? targetSpeedKt, targetSpeedKt)
  };
}

function applyPlannedVerticalExecution(
  aircraft: AircraftState,
  plan: AircraftGuidancePlan
): AircraftState {
  const targetAltitudeFt = plan.vertical.target_altitude_ft;
  const targetVerticalRateFpm = plan.vertical.target_vertical_rate_fpm;

  if (
    typeof targetAltitudeFt !== "number" ||
    !Number.isFinite(targetAltitudeFt) ||
    typeof targetVerticalRateFpm !== "number" ||
    !Number.isFinite(targetVerticalRateFpm)
  ) {
    return aircraft;
  }

  if (explicitControllerVerticalRateAssigned(aircraft)) {
    return aircraft;
  }

  if (plan.vertical.constraint_kind === "controller_altitude") {
    return {
      ...aircraft,
      execution_altitude_ft: targetAltitudeFt,
      execution_vertical_rate_fpm: targetVerticalRateFpm,
      managed_altitude_constraint_fix: plan.vertical.constraint_fix ?? aircraft.managed_altitude_constraint_fix,
      managed_altitude_constraint_ft: targetAltitudeFt,
      managed_vertical_rate_fpm: targetVerticalRateFpm
    };
  }

  if (plan.vertical.constraint_kind === "speed_gate") {
    return {
      ...aircraft,
      execution_altitude_ft: targetAltitudeFt,
      execution_vertical_rate_fpm: targetVerticalRateFpm,
      managed_altitude_constraint_fix: plan.vertical.constraint_fix ?? aircraft.managed_altitude_constraint_fix,
      managed_altitude_constraint_ft: targetAltitudeFt,
      managed_vertical_rate_fpm: targetVerticalRateFpm
    };
  }

  if (
    plan.mode !== "approach" &&
    plan.mode !== "star_des_via" &&
    plan.mode !== "sid"
  ) {
    return aircraft;
  }

  if (
    aircraft.altitude_control_mode === "controller" ||
    aircraft.vertical_rate_control_mode === "controller"
  ) {
    return aircraft;
  }

  return {
    ...aircraft,
    execution_altitude_ft: targetAltitudeFt,
    execution_vertical_rate_fpm: targetVerticalRateFpm,
    altitude_control_mode: "managed",
    vertical_rate_control_mode: "managed",
    managed_altitude_constraint_fix: plan.vertical.constraint_fix ?? aircraft.managed_altitude_constraint_fix,
    managed_altitude_constraint_ft: targetAltitudeFt,
    managed_vertical_rate_fpm: targetVerticalRateFpm
  };
}

function explicitControllerVerticalRateAssigned(aircraft: AircraftState) {
  return (
    aircraft.vertical_rate_control_mode === "controller" &&
    typeof aircraft.assigned?.vertical_rate_fpm === "number" &&
    Number.isFinite(aircraft.assigned.vertical_rate_fpm)
  );
}
