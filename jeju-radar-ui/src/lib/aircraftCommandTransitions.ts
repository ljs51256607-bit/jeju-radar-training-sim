import { initialBearingTrueDeg } from "./aircraftMotion";
import {
  activeGuidanceScratchpadTokens,
  mergeDirectScratchpad,
  removeScratchpadToken,
  removeScratchpadTokens,
  scratchpadContainsToken
} from "./aircraftInteraction";
import { directScratchpad } from "./scenarioTraffic";
import type {
  AircraftControllerSpeedPolicy,
  AircraftState
} from "./types";

export function aircraftWithHeadingCommand(
  aircraft: AircraftState,
  headingTrue: number,
  activeAtMs: number | undefined
): AircraftState {
  const guidanceTokens = activeGuidanceScratchpadTokens(aircraft);
  const shouldClearGuidanceScratchpad = guidanceTokens.some((token) =>
    scratchpadContainsToken(aircraft.scratchpad ?? "", token)
  );

  return {
    ...aircraft,
    route_mode: "vector",
    next_fix: undefined,
    procedure_id: undefined,
    procedure_name: undefined,
    procedure_kind: undefined,
    procedure_route: undefined,
    procedure_route_index: undefined,
    vertical_procedure_mode: "controller",
    star_via_clearance_altitude_ft: undefined,
    managed_altitude_constraint_fix: undefined,
    managed_altitude_constraint_ft: undefined,
    managed_vertical_rate_fpm: undefined,
    execution_heading_true_deg: undefined,
    execution_speed_kt: undefined,
    execution_altitude_ft: undefined,
    execution_vertical_rate_fpm: undefined,
    managed_speed_kt: undefined,
    guidance_active_at_ms: undefined,
    heading_active_at_ms: activeAtMs,
    one_circle_turn_state: undefined,
    scratchpad: shouldClearGuidanceScratchpad
      ? removeScratchpadTokens(aircraft.scratchpad ?? "", guidanceTokens)
      : aircraft.scratchpad,
    scratchpad_auto_direct_token: undefined,
    scratchpad_auto_procedure_token: undefined,
    assigned: {
      ...aircraft.assigned,
      heading_true_deg: headingTrue
    }
  };
}

export function aircraftWithOneCircleHeadingCommand(
  aircraft: AircraftState,
  headingTrue: number,
  direction: "left" | "right",
  activeAtMs: number | undefined
): AircraftState {
  const nextAircraft = aircraftWithHeadingCommand(aircraft, headingTrue, activeAtMs);
  const startHeadingTrueDeg = normalizeHeading(aircraft.heading_true_deg);
  const targetHeadingTrueDeg = normalizeHeading(headingTrue);
  const turnDirection = direction === "right" ? 1 : -1;

  return {
    ...nextAircraft,
    one_circle_turn_state: {
      target_heading_true_deg: targetHeadingTrueDeg,
      direction: turnDirection,
      start_heading_true_deg: startHeadingTrueDeg,
      last_heading_true_deg: startHeadingTrueDeg,
      accumulated_turn_deg: 0,
      required_turn_deg: oneCircleRequiredTurnDeg(
        startHeadingTrueDeg,
        targetHeadingTrueDeg,
        turnDirection
      ),
      started_at_ms: activeAtMs
    }
  };
}

export function aircraftWithControllerSpeedPolicy(
  aircraft: AircraftState,
  speedPolicy: AircraftControllerSpeedPolicy,
  activeAtMs: number | undefined
): AircraftState {
  return {
    ...aircraft,
    controller_assigned_speed_kt: speedPolicy.type === "target" ? speedPolicy.speed_kt : undefined,
    controller_speed_policy: {
      ...speedPolicy,
      active_at_ms: activeAtMs
    },
    speed_control_mode: "controller",
    execution_speed_kt: undefined,
    speed_active_at_ms: activeAtMs,
    assigned: {
      ...aircraft.assigned,
      speed_kt: speedPolicy.speed_kt
    }
  };
}

export function aircraftWithAltitudeCommand(
  aircraft: AircraftState,
  altitude: number,
  activeAtMs: number | undefined
): AircraftState {
  const isStarViaAltitudeClearance =
    aircraft.route_mode === "procedure" &&
    aircraft.procedure_kind === "STAR" &&
    aircraft.vertical_procedure_mode === "des_via";
  const isStarCancelLevelAltitudeClearance =
    aircraft.route_mode === "procedure" &&
    aircraft.procedure_kind === "STAR" &&
    aircraft.vertical_procedure_mode === "cancel_level";

  return {
    ...aircraft,
    altitude_control_mode: isStarViaAltitudeClearance ? "managed" : "controller",
    vertical_rate_control_mode: isStarViaAltitudeClearance
      ? "managed"
      : isStarCancelLevelAltitudeClearance
        ? "controller"
        : aircraft.vertical_rate_control_mode,
    vertical_procedure_mode: isStarViaAltitudeClearance
      ? "des_via"
      : isStarCancelLevelAltitudeClearance
        ? "cancel_level"
        : "controller",
    star_via_clearance_altitude_ft: isStarViaAltitudeClearance ? altitude : undefined,
    managed_altitude_constraint_fix: undefined,
    managed_altitude_constraint_ft: undefined,
    managed_vertical_rate_fpm: undefined,
    pending_descent_altitude_ft: undefined,
    execution_altitude_ft: undefined,
    execution_vertical_rate_fpm: undefined,
    altitude_active_at_ms: activeAtMs,
    assigned: {
      ...aircraft.assigned,
      altitude_ft: altitude
    }
  };
}

export function aircraftWithVerticalRateCommand(
  aircraft: AircraftState,
  verticalRate: number,
  activeAtMs: number | undefined
): AircraftState {
  return {
    ...aircraft,
    vertical_rate_control_mode: "controller",
    vertical_procedure_mode: "controller",
    managed_altitude_constraint_fix: undefined,
    managed_altitude_constraint_ft: undefined,
    managed_vertical_rate_fpm: undefined,
    execution_altitude_ft: undefined,
    execution_vertical_rate_fpm: undefined,
    vertical_rate_active_at_ms: activeAtMs,
    assigned: {
      ...aircraft.assigned,
      vertical_rate_fpm: verticalRate
    }
  };
}

export function aircraftWithDirectToFixCommand(
  aircraft: AircraftState,
  fixId: string,
  fix: { latitude: number; longitude: number },
  activeAtMs: number | undefined
): AircraftState {
  const headingTrue = initialBearingTrueDeg(
    aircraft.latitude,
    aircraft.longitude,
    fix.latitude,
    fix.longitude
  );
  const directToken = directScratchpad(fixId);
  const scratchpadWithoutProcedure = aircraft.scratchpad_auto_procedure_token
    ? removeScratchpadToken(aircraft.scratchpad ?? "", aircraft.scratchpad_auto_procedure_token)
    : aircraft.scratchpad ?? "";

  return {
    ...aircraft,
    route_mode: "direct",
    next_fix: fixId,
    procedure_id: undefined,
    procedure_name: undefined,
    procedure_kind: undefined,
    procedure_route: undefined,
    procedure_route_index: undefined,
    procedure_capture_transition: undefined,
    approach_phase: undefined,
    landing_state: undefined,
    landed_at_ms: undefined,
    altitude_control_mode: "controller",
    vertical_rate_control_mode: "controller",
    vertical_procedure_mode: "controller",
    star_via_clearance_altitude_ft: undefined,
    managed_altitude_constraint_fix: undefined,
    managed_altitude_constraint_ft: undefined,
    managed_vertical_rate_fpm: undefined,
    pending_descent_altitude_ft: undefined,
    execution_heading_true_deg: headingTrue,
    execution_speed_kt: undefined,
    execution_altitude_ft: undefined,
    execution_vertical_rate_fpm: undefined,
    managed_speed_kt: undefined,
    guidance_active_at_ms: activeAtMs,
    heading_active_at_ms: activeAtMs,
    one_circle_turn_state: undefined,
    scratchpad: mergeDirectScratchpad(
      scratchpadWithoutProcedure,
      aircraft.scratchpad_auto_direct_token,
      directToken
    ),
    scratchpad_auto_direct_token: directToken,
    scratchpad_auto_procedure_token: undefined,
    cancelled_approach_level_restriction_fixes: undefined,
    assigned: {
      ...aircraft.assigned
    }
  };
}

function oneCircleRequiredTurnDeg(
  startHeadingTrueDeg: number,
  targetHeadingTrueDeg: number,
  direction: -1 | 1
) {
  const directedDelta =
    direction === 1
      ? (targetHeadingTrueDeg - startHeadingTrueDeg + 360) % 360
      : (startHeadingTrueDeg - targetHeadingTrueDeg + 360) % 360;

  return 360 + directedDelta;
}

function normalizeHeading(headingTrueDeg: number) {
  return ((headingTrueDeg % 360) + 360) % 360;
}
