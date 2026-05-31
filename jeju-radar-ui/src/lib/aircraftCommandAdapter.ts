import {
  addCancelledApproachLevelRestrictionFix,
  addCancelledSpeedRestrictionFix,
  normalizeProcedureFixId
} from "./procedureRestrictionState";
import type {
  AircraftState,
  LevelRestrictionCancellationPolicy,
  SpeedRestrictionCancellationPolicy
} from "./types";

export type AircraftCommandAdapterStatus = "applied" | "confirmation_required" | "unable";

export interface AircraftCommandAdapterResult {
  status: AircraftCommandAdapterStatus;
  aircraft: AircraftState;
  reason?: string;
}

export function applyScopedLevelRestrictionCancellation(
  aircraft: AircraftState,
  policy: LevelRestrictionCancellationPolicy
): AircraftCommandAdapterResult {
  if (policy.requires_confirmation || policy.scope === "APP_ALL") {
    return {
      status: "confirmation_required",
      aircraft,
      reason: "missing approach fix scope"
    };
  }

  if (policy.scope === "STAR") {
    if (aircraft.procedure_kind !== "STAR") {
      return {
        status: "unable",
        aircraft,
        reason: "aircraft is not on a STAR"
      };
    }

    return {
      status: "applied",
      aircraft: {
        ...aircraft,
        vertical_procedure_mode: "cancel_level",
        star_via_clearance_altitude_ft: undefined,
        managed_altitude_constraint_fix: undefined,
        managed_altitude_constraint_ft: undefined,
        managed_vertical_rate_fpm: undefined,
        pending_descent_altitude_ft: undefined
      }
    };
  }

  if (policy.scope !== "APP_FIX") {
    return {
      status: "unable",
      aircraft,
      reason: "unsupported level restriction cancellation scope"
    };
  }

  if (!policy.fix_id) {
    return {
      status: "unable",
      aircraft,
      reason: "APP_FIX cancellation requires fix_id"
    };
  }

  if (aircraft.procedure_kind !== "APP" || aircraft.route_mode !== "procedure") {
    return {
      status: "unable",
      aircraft,
      reason: "aircraft is not on an approach procedure"
    };
  }

  const normalizedFixId = normalizeProcedureFixId(policy.fix_id);
  const route = aircraft.procedure_route?.map(normalizeProcedureFixId) ?? [];

  if (!route.includes(normalizedFixId)) {
    return {
      status: "unable",
      aircraft,
      reason: "fix is not on active approach route"
    };
  }

  const updatedAircraft = addCancelledApproachLevelRestrictionFix(aircraft, normalizedFixId);
  const clearActiveManagedConstraint =
    typeof aircraft.managed_altitude_constraint_fix === "string" &&
    normalizeProcedureFixId(aircraft.managed_altitude_constraint_fix) === normalizedFixId;

  return {
    status: "applied",
    aircraft: clearActiveManagedConstraint
      ? {
          ...updatedAircraft,
          execution_altitude_ft: undefined,
          execution_vertical_rate_fpm: undefined,
          managed_altitude_constraint_fix: undefined,
          managed_altitude_constraint_ft: undefined,
          managed_vertical_rate_fpm: undefined,
          pending_descent_altitude_ft: undefined
        }
      : updatedAircraft
  };
}

export function applyScopedSpeedRestrictionCancellation(
  aircraft: AircraftState,
  policy: SpeedRestrictionCancellationPolicy,
  activeConflictFixId?: string
): AircraftCommandAdapterResult {
  const fixId = policy.fix_id ?? activeConflictFixId;

  if ((policy.requires_confirmation || policy.scope === "ACTIVE_NEXT") && !fixId) {
    return {
      status: "confirmation_required",
      aircraft,
      reason: "missing speed restriction fix scope"
    };
  }

  if (!fixId) {
    return {
      status: "unable",
      aircraft,
      reason: "speed restriction cancellation requires fix_id"
    };
  }

  if (aircraft.route_mode !== "procedure") {
    return {
      status: "unable",
      aircraft,
      reason: "aircraft is not on a procedure route"
    };
  }

  const normalizedFixId = normalizeProcedureFixId(fixId);
  const route = aircraft.procedure_route?.map(normalizeProcedureFixId) ?? [];

  if (!route.includes(normalizedFixId)) {
    return {
      status: "unable",
      aircraft,
      reason: "fix is not on active procedure route"
    };
  }

  return {
    status: "applied",
    aircraft: addCancelledSpeedRestrictionFix(aircraft, normalizedFixId)
  };
}
