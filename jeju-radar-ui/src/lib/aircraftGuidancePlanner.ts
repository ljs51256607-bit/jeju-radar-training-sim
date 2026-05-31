import {
  distanceNmBetweenPoints,
  groundSpeedFromIndicatedSpeed,
  initialBearingTrueDeg
} from "./aircraftMotion";
import {
  currentIndicatedSpeedKt,
  requiredSpeedReductionDistanceNm,
  speedAdjustedPlanningTime
} from "./aircraftSpeedPlanning";
import { flightProfileForDataset } from "./flightProfileGuidance";
import { approachLevelRestrictionCanceled, speedRestrictionCanceled } from "./procedureRestrictionState";
import { verticalProfileForDataset } from "./verticalProfileGuidance";
import {
  resolveWindAtAltitude,
  windCorrectedMotionForHeading
} from "./windModel";
import type {
  AircraftPerformanceProfile,
  AircraftState,
  AircraftVerticalProcedureMode,
  FlightProfileRecord,
  ProcedureVerticalConstraintSet,
  RadarDataset,
  VerticalConstraintRecord,
  VerticalProfileRecord,
  WindSettings
} from "./types";

interface DirectFixTarget {
  id: string;
  latitude: number;
  longitude: number;
}

export type AircraftGuidanceMode =
  | "vector"
  | "direct"
  | "star_cancel_level"
  | "star_des_via"
  | "approach"
  | "sid"
  | "hold";

export type AircraftGuidanceConstraintKind =
  | "controller_altitude"
  | "controller_speed"
  | "procedure_altitude"
  | "procedure_speed"
  | "procedure_climb_gradient"
  | "speed_gate";

export interface AircraftGuidanceConstraint {
  kind: AircraftGuidanceConstraintKind;
  altitude_role?: "controller_cleared" | "procedure_default" | "landing_profile";
  fix_id?: string;
  fix_index?: number;
  distance_nm?: number;
  altitude_ft?: number;
  min_altitude_ft?: number;
  max_altitude_ft?: number;
  max_vertical_rate_fpm?: number;
  speed_kt?: number;
  climb_gradient_pct?: number;
  climb_gradient_purpose?: string;
  required_climb_gradient_ft_per_nm?: number;
  required_until_altitude_ft?: number;
  source: string;
}

export interface AircraftGuidanceSpeedPlan {
  target_speed_kt?: number;
  reason?: string;
  constraint_fix?: string;
  remaining_distance_nm?: number;
  required_distance_nm?: number;
  feasible: boolean;
  late_by_nm?: number;
}

export interface AircraftGuidanceVerticalPlan {
  target_altitude_ft?: number;
  target_vertical_rate_fpm?: number;
  required_vertical_rate_fpm?: number;
  max_vertical_rate_fpm?: number;
  planning_ground_speed_kt?: number;
  planning_time_min?: number;
  speed_adjustment_distance_nm?: number;
  landing_feasible?: boolean;
  landing_required_vertical_rate_fpm?: number;
  landing_distance_nm?: number;
  required_climb_gradient_ft_per_nm?: number;
  max_climb_gradient_ft_per_nm?: number;
  climb_gradient_feasible?: boolean;
  constraint_kind?: AircraftGuidanceConstraintKind;
  altitude_role?: AircraftGuidanceConstraint["altitude_role"];
  profile_status?: "stable" | "high_but_recoverable" | "too_high" | "too_low" | "unable";
  reason?: string;
  constraint_fix?: string;
  remaining_distance_nm?: number;
  feasible: boolean;
}

export interface AircraftGuidancePlan {
  aircraft_id: string;
  generated_at_ms: number;
  mode: AircraftGuidanceMode;
  active_fix_id?: string;
  route: string[];
  route_index: number;
  constraints: AircraftGuidanceConstraint[];
  speed: AircraftGuidanceSpeedPlan;
  vertical: AircraftGuidanceVerticalPlan;
}

export interface AircraftGuidancePlannerOptions {
  wind?: WindSettings;
}

interface RouteState {
  route: string[];
  routeIndex: number;
  activeFixId?: string;
}

interface SpeedCandidate {
  speedKt: number;
  reason: string;
  fixId?: string;
  distanceNm?: number;
  requiredDistanceNm?: number;
  feasible: boolean;
}

interface AltitudeCandidate {
  altitudeFt: number;
  reason: string;
  fixId?: string;
  distanceNm?: number;
  maxVerticalRateFpm?: number;
  kind: AircraftGuidanceConstraintKind;
  altitudeRole?: AircraftGuidanceConstraint["altitude_role"];
}

const ILS_FINAL_GLIDEPATH_FT_PER_NM = 318;
const ILS_FINAL_MAX_DESCENT_FPM = 1500;
const APPROACH_RECOVERABLE_DESCENT_BUFFER_FPM = 150;
const EXPEDITE_DESCENT_DEFAULT_SPEED_BIAS_KT = 20;
const EXPEDITE_DESCENT_DEFAULT_MAX_SPEED_KT = 300;
const EXPEDITE_DESCENT_LOW_ALTITUDE_MAX_SPEED_KT = 250;
const EXPEDITE_DESCENT_RATE_FACTOR = 1.3;
const EXPEDITE_CLIMB_RATE_FACTOR = 1.2;
const INCREASE_RATE_STEP_FPM = 500;
const DEFAULT_CLIMB_ACCEL_VERTICAL_PENALTY_FPM_PER_KT_SEC = 1200;
const FEET_PER_NM = 6076.12;
const ILS_FINAL_PROFILES: Record<string, { runwayElevationFt: number; touchdownAltitudeFt: number }> = {
  RW070: { runwayElevationFt: 87, touchdownAltitudeFt: 120 },
  RW250: { runwayElevationFt: 76, touchdownAltitudeFt: 120 }
};

export function buildAircraftGuidancePlan(
  aircraft: AircraftState,
  dataset: RadarDataset,
  currentTimeMs: number,
  options: AircraftGuidancePlannerOptions = {}
): AircraftGuidancePlan {
  const flightProfile = flightProfileForDataset(dataset);
  const verticalProfile = verticalProfileForDataset(dataset);
  const routeState = routeStateForAircraft(aircraft);
  const mode = guidanceModeForAircraft(aircraft);
  const constraints = buildGuidanceConstraints(
    aircraft,
    dataset,
    routeState,
    mode,
    flightProfile,
    verticalProfile
  );

  const speed = planSpeed(aircraft, constraints);

  return {
    aircraft_id: aircraft.id,
    generated_at_ms: currentTimeMs,
    mode,
    active_fix_id: routeState.activeFixId,
    route: routeState.route,
    route_index: routeState.routeIndex,
    constraints,
    speed,
    vertical: planVertical(
      aircraft,
      dataset,
      routeState,
      constraints,
      verticalProfile,
      flightProfile,
      mode,
      speed,
      options
    )
  };
}

function routeStateForAircraft(aircraft: AircraftState): RouteState {
  if (aircraft.route_mode === "procedure" && aircraft.procedure_route?.length) {
    const route = aircraft.procedure_route.map(normalizeFixId);
    const routeIndex = clampNumber(aircraft.procedure_route_index ?? 0, 0, Math.max(0, route.length - 1));

    return {
      route,
      routeIndex,
      activeFixId: route[routeIndex]
    };
  }

  if (aircraft.route_mode === "direct" && aircraft.next_fix) {
    return {
      route: [normalizeFixId(aircraft.next_fix)],
      routeIndex: 0,
      activeFixId: normalizeFixId(aircraft.next_fix)
    };
  }

  return {
    route: [],
    routeIndex: 0
  };
}

function guidanceModeForAircraft(aircraft: AircraftState): AircraftGuidanceMode {
  if (aircraft.route_mode === "hold") {
    return "hold";
  }

  if (aircraft.route_mode === "direct") {
    return "direct";
  }

  if (aircraft.route_mode === "vector") {
    return "vector";
  }

  if (aircraft.procedure_kind === "APP") {
    return "approach";
  }

  if (aircraft.procedure_kind === "SID") {
    return "sid";
  }

  if (aircraft.procedure_kind === "STAR") {
    return verticalProcedureMode(aircraft) === "des_via" ? "star_des_via" : "star_cancel_level";
  }

  return "vector";
}

function buildGuidanceConstraints(
  aircraft: AircraftState,
  dataset: RadarDataset,
  routeState: RouteState,
  mode: AircraftGuidanceMode,
  flightProfile: FlightProfileRecord,
  verticalProfile: VerticalProfileRecord
) {
  const constraints: AircraftGuidanceConstraint[] = [];
  const route = routeState.route;
  const routeIndex = routeState.routeIndex;
  const controllerAltitude = aircraft.assigned?.altitude_ft;
  const controllerPolicy = aircraft.controller_speed_policy;
  const controllerSpeed =
    controllerPolicy && (controllerPolicy.type === "target" || controllerPolicy.type === "minimum_practical")
      ? controllerPolicy.speed_kt
      : aircraft.speed_control_mode === "controller" && !aircraft.controller_speed_policy
        ? aircraft.controller_assigned_speed_kt
        : undefined;
  const activeFixDistanceNm =
    route.length > 0
      ? distanceAlongRouteNm(aircraft, dataset, route, routeIndex, routeIndex)
      : null;
  const controllerAltitudeConstraintTarget = controllerAltitudeTargetForAircraft(
    aircraft,
    dataset,
    routeState,
    activeFixDistanceNm
  );
  const controllerAltitudeMatchesManagedConstraint =
    typeof controllerAltitude === "number" &&
    Number.isFinite(controllerAltitude) &&
    typeof aircraft.managed_altitude_constraint_ft === "number" &&
    Number.isFinite(aircraft.managed_altitude_constraint_ft) &&
    Math.abs(aircraft.managed_altitude_constraint_ft - controllerAltitude) <= 50;

  if (typeof controllerAltitude === "number" && Number.isFinite(controllerAltitude)) {
    constraints.push({
      kind: "controller_altitude",
      altitude_role: "controller_cleared",
      fix_id: controllerAltitudeConstraintTarget.fixId,
      fix_index: controllerAltitudeConstraintTarget.fixIndex,
      distance_nm: controllerAltitudeConstraintTarget.distanceNm,
      altitude_ft: controllerAltitude,
      source: controllerAltitudeConstraintTarget.managedConstraintActive &&
        controllerAltitudeMatchesManagedConstraint
        ? "controller crossing restriction"
        : controllerAltitudeSource(aircraft, routeState, verticalProfile)
    });
  }

  if (typeof controllerSpeed === "number" && Number.isFinite(controllerSpeed)) {
    constraints.push({
      kind: "controller_speed",
      speed_kt: controllerSpeed,
      source: "controller assigned speed"
    });
  }

  if (aircraft.flight_phase === "arrival") {
    const gate = flightProfile.arrival.speed_gate;

    if (
      aircraft.altitude_ft <= gate.altitude_ft ||
      (typeof aircraft.assigned?.altitude_ft === "number" && aircraft.assigned.altitude_ft < gate.altitude_ft) ||
      typeof aircraft.pending_descent_altitude_ft === "number"
    ) {
      constraints.push({
        kind: "speed_gate",
        altitude_ft: gate.altitude_ft,
        speed_kt: gate.max_speed_kt,
        source: "arrival 10000ft speed gate"
      });
    }
  }

  if (aircraft.route_mode !== "procedure" || route.length === 0) {
    return constraints;
  }

  const matchingSets = constraintSetsForAircraft(aircraft, verticalProfile);
  const includeProcedureAltitudes =
    mode === "approach" ||
    mode === "sid" ||
    (mode === "star_des_via" && typeof starViaDescentClearanceAltitudeFt(aircraft) === "number");

  for (const constraintSet of matchingSets) {
    if (mode === "sid") {
      constraints.push(
        ...sidClimbGradientConstraintsForSet(aircraft, constraintSet, verticalProfile)
      );
    }

    for (const constraint of constraintSet.constraints) {
      const fixIndex = routeIndexOfFixAtOrAfter(route, constraint.fix_id, routeIndex);

      if (fixIndex < 0) {
        continue;
      }

      const distanceNm = distanceAlongRouteNm(aircraft, dataset, route, routeIndex, fixIndex);
      const fixId = normalizeFixId(constraint.fix_id);

      if (
        includeProcedureAltitudes &&
        hasAltitudeConstraint(constraint) &&
        !(
          aircraft.procedure_kind === "APP" &&
          approachLevelRestrictionCanceled(aircraft, constraint.fix_id)
        )
      ) {
        const altitudeFields = procedureAltitudeFieldsForConstraint(constraint, mode);

        constraints.push({
          kind: "procedure_altitude",
          altitude_role: "procedure_default",
          fix_id: fixId,
          fix_index: fixIndex,
          distance_nm: distanceNm ?? undefined,
          altitude_ft: altitudeFields.altitude_ft,
          min_altitude_ft: altitudeFields.min_altitude_ft,
          max_altitude_ft: altitudeFields.max_altitude_ft,
          source: constraint.source_text
        });
      }

      if (
        typeof constraint.speed_kt === "number" &&
        Number.isFinite(constraint.speed_kt) &&
        !speedRestrictionCanceled(aircraft, constraint.fix_id)
      ) {
        constraints.push({
          kind: "procedure_speed",
          fix_id: fixId,
          fix_index: fixIndex,
          distance_nm: distanceNm ?? undefined,
          speed_kt: constraint.speed_kt,
          source: constraint.source_text
        });
      }
    }
  }

  for (let index = routeIndex; index < route.length; index += 1) {
    const fixId = route[index];
    const speedLimitKt = flightProfile.arrival.procedure_speed_max_kt[fixId];

    if (
      typeof speedLimitKt !== "number" ||
      !Number.isFinite(speedLimitKt) ||
      speedRestrictionCanceled(aircraft, fixId)
    ) {
      continue;
    }

    const distanceNm = distanceAlongRouteNm(aircraft, dataset, route, routeIndex, index);

    constraints.push({
      kind: "procedure_speed",
      fix_id: fixId,
      fix_index: index,
      distance_nm: distanceNm ?? undefined,
      speed_kt: speedLimitKt,
      source: "flight profile procedure speed cap"
    });
  }

  const landingSpeedConstraint = approachLandingSpeedConstraint(
    aircraft,
    dataset,
    route,
    flightProfile
  );

  if (landingSpeedConstraint) {
    constraints.push(landingSpeedConstraint);
  }

  constraints.push(
    ...carriedForwardStarConstraints(
      aircraft,
      dataset,
      route,
      routeIndex,
      mode,
      matchingSets,
      constraints
    )
  );

  const finalGlidepathConstraint = finalGlidepathAltitudeConstraint(aircraft, dataset, routeState);

  if (finalGlidepathConstraint) {
    constraints.push(finalGlidepathConstraint);
  }

  return constraints;
}

function approachLandingSpeedConstraint(
  aircraft: AircraftState,
  dataset: RadarDataset,
  route: string[],
  flightProfile: FlightProfileRecord
): AircraftGuidanceConstraint | null {
  if (aircraft.route_mode !== "procedure" || aircraft.procedure_kind !== "APP" || route.length === 0) {
    return null;
  }

  const thresholdFixId = route[route.length - 1];

  if (!thresholdFixId?.startsWith("RW")) {
    return null;
  }

  const thresholdFix = resolveDirectFix(dataset, thresholdFixId);

  if (!thresholdFix) {
    return null;
  }

  const landingRule = flightProfile.arrival.approach_landing_speed;
  const thresholdDistanceNm =
    typeof landingRule?.threshold_distance_nm === "number" &&
    Number.isFinite(landingRule.threshold_distance_nm)
      ? landingRule.threshold_distance_nm
      : 5;
  const distanceToThresholdNm = distanceNmBetweenPoints(
    aircraft.latitude,
    aircraft.longitude,
    thresholdFix.latitude,
    thresholdFix.longitude
  );

  if (distanceToThresholdNm > thresholdDistanceNm) {
    return null;
  }

  return {
    kind: "speed_gate",
    fix_id: thresholdFixId,
    fix_index: route.length - 1,
    distance_nm: distanceToThresholdNm,
    speed_kt: landingSpeedForAircraftType(aircraft.aircraft_type, flightProfile),
    source: `ILS landing speed inside ${thresholdDistanceNm} NM`
  };
}

function landingSpeedForAircraftType(
  aircraftType: string,
  flightProfile: FlightProfileRecord
) {
  const landingRule = flightProfile.arrival.approach_landing_speed;
  const normalizedType = normalizeAircraftType(aircraftType);
  const typeSpeeds = landingRule?.by_aircraft_type ?? {};

  for (const [rawType, speedKt] of Object.entries(typeSpeeds)) {
    const normalizedKey = normalizeAircraftType(rawType);

    if (
      normalizedKey &&
      (normalizedType === normalizedKey || normalizedType.startsWith(normalizedKey)) &&
      typeof speedKt === "number" &&
      Number.isFinite(speedKt)
    ) {
      return speedKt;
    }
  }

  const defaultSpeedKt = landingRule?.default_speed_kt;

  return typeof defaultSpeedKt === "number" && Number.isFinite(defaultSpeedKt)
    ? defaultSpeedKt
    : 145;
}

function normalizeAircraftType(aircraftType: string) {
  return aircraftType.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function carriedForwardStarConstraints(
  aircraft: AircraftState,
  dataset: RadarDataset,
  route: string[],
  routeIndex: number,
  mode: AircraftGuidanceMode,
  matchingSets: ProcedureVerticalConstraintSet[],
  existingConstraints: AircraftGuidanceConstraint[]
): AircraftGuidanceConstraint[] {
  if (
    aircraft.procedure_kind !== "STAR" ||
    (mode !== "star_des_via" && mode !== "star_cancel_level") ||
    route.length === 0
  ) {
    return [];
  }

  const activeFixId = route[routeIndex];

  if (!activeFixId) {
    return [];
  }

  const activeDistanceNm = distanceAlongRouteNm(aircraft, dataset, route, routeIndex, routeIndex) ?? undefined;
  const constraints: AircraftGuidanceConstraint[] = [];
  const carriedSpeed = nearestPriorRouteConstraint(route, routeIndex, matchingSets, "speed");

  if (
    carriedSpeed &&
    typeof carriedSpeed.constraint.speed_kt === "number" &&
    !speedRestrictionCanceled(aircraft, activeFixId) &&
    !existingConstraints.some(
      (constraint) =>
        constraint.kind === "procedure_speed" &&
        constraint.fix_id === activeFixId &&
        constraint.speed_kt === carriedSpeed.constraint.speed_kt
    )
  ) {
    constraints.push({
      kind: "procedure_speed",
      fix_id: activeFixId,
      fix_index: routeIndex,
      distance_nm: activeDistanceNm,
      speed_kt: carriedSpeed.constraint.speed_kt,
      source: `${carriedSpeed.constraint.source_text}; carried forward to ${activeFixId}`
    });
  }

  if (mode !== "star_des_via") {
    return constraints;
  }

  const carriedAltitude = nearestPriorRouteConstraint(route, routeIndex, matchingSets, "at_altitude");

  if (
    carriedAltitude &&
    typeof carriedAltitude.constraint.altitude_ft === "number" &&
    !existingConstraints.some(
      (constraint) =>
        constraint.kind === "procedure_altitude" &&
        constraint.fix_id === activeFixId &&
        constraint.altitude_ft === carriedAltitude.constraint.altitude_ft
    )
  ) {
    constraints.push({
      kind: "procedure_altitude",
      altitude_role: "procedure_default",
      fix_id: activeFixId,
      fix_index: routeIndex,
      distance_nm: typeof activeDistanceNm === "number" ? Math.max(0.1, activeDistanceNm) : undefined,
      altitude_ft: carriedAltitude.constraint.altitude_ft,
      source: `${carriedAltitude.constraint.source_text}; carried forward by AIP '-' coding to ${activeFixId}`
    });
  }

  return constraints;
}

function nearestPriorRouteConstraint(
  route: string[],
  routeIndex: number,
  matchingSets: ProcedureVerticalConstraintSet[],
  selector: "speed" | "at_altitude"
) {
  let result:
    | {
        constraint: VerticalConstraintRecord;
        routeIndex: number;
      }
    | undefined;

  for (const constraint of matchingSets.flatMap((constraintSet) => constraintSet.constraints)) {
    if (
      selector === "speed" &&
      (typeof constraint.speed_kt !== "number" || !Number.isFinite(constraint.speed_kt))
    ) {
      continue;
    }

    if (
      selector === "at_altitude" &&
      (constraint.type !== "at" ||
        typeof constraint.altitude_ft !== "number" ||
        !Number.isFinite(constraint.altitude_ft))
    ) {
      continue;
    }

    const constraintRouteIndex = route.indexOf(normalizeFixId(constraint.fix_id));

    if (constraintRouteIndex < 0 || constraintRouteIndex > routeIndex) {
      continue;
    }

    if (!result || constraintRouteIndex > result.routeIndex) {
      result = {
        constraint,
        routeIndex: constraintRouteIndex
      };
    }
  }

  return result;
}

function planSpeed(
  aircraft: AircraftState,
  constraints: AircraftGuidanceConstraint[]
): AircraftGuidanceSpeedPlan {
  const currentSpeedKt = currentIndicatedSpeedKt(aircraft);
  const candidates: SpeedCandidate[] = [];

  for (const constraint of constraints) {
    if (typeof constraint.speed_kt !== "number" || !Number.isFinite(constraint.speed_kt)) {
      continue;
    }

    if (constraint.kind === "controller_speed") {
      candidates.push({
        speedKt: constraint.speed_kt,
        reason: constraint.source,
        feasible: true
      });
      continue;
    }

    if (currentSpeedKt <= constraint.speed_kt + 1) {
      continue;
    }

    const requiredDistanceNm = requiredSpeedReductionDistanceNm(
      currentSpeedKt,
      constraint.speed_kt,
      aircraft.ground_speed_kt
    );
    const distanceNm = constraint.distance_nm;
    const active =
      constraint.kind === "speed_gate" ||
      typeof distanceNm !== "number" ||
      distanceNm <= requiredDistanceNm;

    if (active) {
      candidates.push({
        speedKt: constraint.speed_kt,
        reason: constraint.source,
        fixId: constraint.fix_id,
        distanceNm,
        requiredDistanceNm,
        feasible: typeof distanceNm !== "number" || distanceNm + 0.1 >= requiredDistanceNm
      });
    }
  }

  const expediteSpeedCandidate = expediteDescentSpeedCandidate(aircraft, constraints, currentSpeedKt);

  if (expediteSpeedCandidate) {
    candidates.push(expediteSpeedCandidate);
  }

  if (candidates.length === 0) {
    return {
      feasible: true
    };
  }

  candidates.sort((first, second) => first.speedKt - second.speedKt);
  const selected = candidates[0];
  const lateByNm =
    typeof selected.distanceNm === "number" &&
    typeof selected.requiredDistanceNm === "number" &&
    selected.requiredDistanceNm > selected.distanceNm
      ? selected.requiredDistanceNm - selected.distanceNm
      : undefined;

  return {
    target_speed_kt: selected.speedKt,
    reason: selected.reason,
    constraint_fix: selected.fixId,
    remaining_distance_nm: selected.distanceNm,
    required_distance_nm: selected.requiredDistanceNm,
    feasible: lateByNm === undefined || lateByNm <= 0.1,
    late_by_nm: lateByNm
  };
}

function expediteDescentSpeedCandidate(
  aircraft: AircraftState,
  constraints: AircraftGuidanceConstraint[],
  currentSpeedKt: number
): SpeedCandidate | null {
  if (
    aircraft.energy_mode !== "expedite_descent" ||
    !hasDescentIntent(aircraft) ||
    aircraft.approach_phase === "final" ||
    aircraft.approach_phase === "landed" ||
    constraints.some((constraint) => constraint.kind === "controller_speed")
  ) {
    return null;
  }

  const proceduralSpeedCaps = constraints
    .filter((constraint) => constraint.kind !== "controller_speed")
    .map((constraint) => constraint.speed_kt)
    .filter((speedKt): speedKt is number => typeof speedKt === "number" && Number.isFinite(speedKt));
  const altitudeTargetFt = aircraft.execution_altitude_ft ?? aircraft.assigned?.altitude_ft ?? aircraft.pending_descent_altitude_ft;
  const lowAltitudeSpeedLimitApplies =
    aircraft.altitude_ft <= 10000 ||
    (typeof altitudeTargetFt === "number" && Number.isFinite(altitudeTargetFt) && altitudeTargetFt <= 10000);
  const defaultMaxSpeedKt = lowAltitudeSpeedLimitApplies
    ? EXPEDITE_DESCENT_LOW_ALTITUDE_MAX_SPEED_KT
    : EXPEDITE_DESCENT_DEFAULT_MAX_SPEED_KT;
  const maxSpeedKt = Math.min(defaultMaxSpeedKt, ...proceduralSpeedCaps);
  const targetSpeedKt = Math.min(
    currentSpeedKt + EXPEDITE_DESCENT_DEFAULT_SPEED_BIAS_KT,
    maxSpeedKt
  );

  if (!Number.isFinite(targetSpeedKt) || targetSpeedKt <= currentSpeedKt + 1) {
    return null;
  }

  return {
    speedKt: targetSpeedKt,
    reason: "expedite descent energy bias",
    feasible: true
  };
}

function hasDescentIntent(aircraft: AircraftState) {
  const altitudeTargetFt = aircraft.execution_altitude_ft ?? aircraft.assigned?.altitude_ft ?? aircraft.pending_descent_altitude_ft;
  const verticalRateTargetFpm = aircraft.execution_vertical_rate_fpm ?? aircraft.assigned?.vertical_rate_fpm;

  return (
    aircraft.vertical_rate_fpm < -100 ||
    (typeof verticalRateTargetFpm === "number" && Number.isFinite(verticalRateTargetFpm) && verticalRateTargetFpm < -100) ||
    (typeof altitudeTargetFt === "number" &&
      Number.isFinite(altitudeTargetFt) &&
      altitudeTargetFt < aircraft.altitude_ft - 100)
  );
}

function planVertical(
  aircraft: AircraftState,
  dataset: RadarDataset,
  routeState: RouteState,
  constraints: AircraftGuidanceConstraint[],
  verticalProfile: VerticalProfileRecord,
  flightProfile: FlightProfileRecord,
  mode: AircraftGuidanceMode,
  speedPlan: AircraftGuidanceSpeedPlan,
  options: AircraftGuidancePlannerOptions
): AircraftGuidanceVerticalPlan {
  const candidate = nextAltitudeCandidate(aircraft, constraints, verticalProfile, mode);
  const landingPlan = approachLandingFeasibilityPlan(aircraft, dataset, routeState, speedPlan);

  if (!candidate) {
    return {
      ...landingPlan,
      profile_status: "stable",
      feasible: true
    };
  }

  const altitudeDeltaFt = candidate.altitudeFt - aircraft.altitude_ft;

  if (Math.abs(altitudeDeltaFt) <= verticalProfile.constraint_capture_ft) {
    return {
      target_altitude_ft: candidate.altitudeFt,
      target_vertical_rate_fpm: 0,
      required_vertical_rate_fpm: 0,
      max_vertical_rate_fpm: altitudeDeltaFt < 0 ? verticalProfile.max_descent_fpm : verticalProfile.max_climb_fpm,
      ...landingPlan,
      constraint_kind: candidate.kind,
      altitude_role: candidate.altitudeRole,
      profile_status: "stable",
      reason: candidate.reason,
      constraint_fix: candidate.fixId,
      remaining_distance_nm: candidate.distanceNm,
      feasible: true
    };
  }

  const direction = Math.sign(altitudeDeltaFt);
  const maxRateFpm = maxVerticalRateForAltitudeCandidate(
    aircraft,
    dataset,
    mode,
    candidate,
    direction,
    verticalProfile,
    speedPlan
  );
  const defaultRateFpm =
    direction < 0
      ? flightProfile.arrival.default_descent_fpm
      : flightProfile.arrival.default_climb_fpm;
  const windAdjustedGroundSpeedKt = planningGroundSpeedForAltitudeCandidate(
    aircraft,
    dataset,
    candidate,
    options.wind
  );
  const planningAircraft = {
    ...aircraft,
    ground_speed_kt: windAdjustedGroundSpeedKt
  };
  const speedAdjustedTime = speedAdjustedPlanningTime(
    planningAircraft,
    speedPlan.target_speed_kt,
    candidate.distanceNm
  );
  const planningGroundSpeedKt =
    typeof speedAdjustedTime?.minutes === "number" && speedAdjustedTime.minutes > 0 && typeof candidate.distanceNm === "number"
      ? candidate.distanceNm / speedAdjustedTime.minutes * 60
      : windAdjustedGroundSpeedKt;
  const requiredRateFpm =
    typeof speedAdjustedTime?.minutes === "number" && speedAdjustedTime.minutes > 0
      ? Math.abs(altitudeDeltaFt) / speedAdjustedTime.minutes
      : requiredVerticalRateFpm(
          Math.abs(altitudeDeltaFt),
          candidate.distanceNm,
          planningGroundSpeedKt,
          defaultRateFpm
        );
  const climbGradientPlan = climbGradientPlanForVertical(
    constraints,
    mode,
    direction,
    planningGroundSpeedKt,
    maxRateFpm
  );
  const requiredRateWithGradientFpm = Math.max(
    requiredRateFpm,
    climbGradientPlan.requiredVerticalRateFpm ?? 0
  );
  const targetRateAbsFpm = Math.min(maxRateFpm, Math.max(direction < 0 ? verticalProfile.min_descent_fpm : verticalProfile.min_climb_fpm, requiredRateWithGradientFpm));
  const energyAdjustedTargetRateAbsFpm = verticalEnergyTargetRateAbsFpm(
    aircraft,
    dataset,
    mode,
    candidate,
    speedPlan,
    direction,
    targetRateAbsFpm,
    maxRateFpm,
    defaultRateFpm
  );
  const rawProfileStatus = verticalProfileStatus(direction, requiredRateWithGradientFpm, maxRateFpm, defaultRateFpm);
  const landingAdjustedProfileStatus = approachAdjustedProfileStatus(
    mode,
    candidate,
    rawProfileStatus,
    landingPlan
  );
  const candidateFeasible = requiredRateWithGradientFpm <= maxRateFpm + 1;
  const finalFeasible =
    candidateFeasible ||
    (approachCandidateCanUseLandingFeasibility(mode, candidate) &&
      landingPlan.landing_feasible === true);
  const finalTargetRateAbsFpm = approachRecoverableTargetVerticalRateAbsFpm(
    mode,
    candidate,
    landingAdjustedProfileStatus,
    landingPlan,
    direction,
    energyAdjustedTargetRateAbsFpm,
    maxRateFpm,
    verticalProfile
  );

  return {
    target_altitude_ft: candidate.altitudeFt,
    target_vertical_rate_fpm: direction * finalTargetRateAbsFpm,
    required_vertical_rate_fpm: direction * requiredRateWithGradientFpm,
    max_vertical_rate_fpm: maxRateFpm,
    planning_ground_speed_kt: planningGroundSpeedKt,
    planning_time_min: speedAdjustedTime?.minutes,
    speed_adjustment_distance_nm: speedAdjustedTime?.speedAdjustmentDistanceNm,
    ...landingPlan,
    required_climb_gradient_ft_per_nm: climbGradientPlan.requiredClimbGradientFtPerNm,
    max_climb_gradient_ft_per_nm: climbGradientPlan.maxClimbGradientFtPerNm,
    climb_gradient_feasible: climbGradientPlan.feasible,
    constraint_kind: candidate.kind,
    altitude_role: candidate.altitudeRole,
    profile_status: landingAdjustedProfileStatus,
    reason: climbGradientPlan.feasible === false ? climbGradientPlan.reason : candidate.reason,
    constraint_fix: candidate.fixId,
    remaining_distance_nm: candidate.distanceNm,
    feasible: finalFeasible
  };
}

function climbGradientPlanForVertical(
  constraints: AircraftGuidanceConstraint[],
  mode: AircraftGuidanceMode,
  direction: number,
  planningGroundSpeedKt: number,
  maxRateFpm: number
) {
  if (mode !== "sid" || direction <= 0 || !Number.isFinite(planningGroundSpeedKt) || planningGroundSpeedKt <= 0) {
    return {};
  }

  const climbGradientConstraint = constraints
    .filter(
      (constraint) =>
        constraint.kind === "procedure_climb_gradient" &&
        typeof constraint.required_climb_gradient_ft_per_nm === "number" &&
        Number.isFinite(constraint.required_climb_gradient_ft_per_nm)
    )
    .sort(
      (first, second) =>
        (second.required_climb_gradient_ft_per_nm ?? 0) -
        (first.required_climb_gradient_ft_per_nm ?? 0)
    )[0];

  if (!climbGradientConstraint || typeof climbGradientConstraint.required_climb_gradient_ft_per_nm !== "number") {
    return {};
  }

  const maxClimbGradientFtPerNm = maxRateFpm / (planningGroundSpeedKt / 60);
  const requiredVerticalRateFpm =
    climbGradientConstraint.required_climb_gradient_ft_per_nm * (planningGroundSpeedKt / 60);

  return {
    requiredClimbGradientFtPerNm: climbGradientConstraint.required_climb_gradient_ft_per_nm,
    maxClimbGradientFtPerNm,
    requiredVerticalRateFpm,
    feasible: maxClimbGradientFtPerNm + 1 >= climbGradientConstraint.required_climb_gradient_ft_per_nm,
    reason: climbGradientConstraint.source
  };
}

function maxVerticalRateForAltitudeCandidate(
  aircraft: AircraftState,
  dataset: RadarDataset,
  mode: AircraftGuidanceMode,
  candidate: AltitudeCandidate,
  direction: number,
  verticalProfile: VerticalProfileRecord,
  speedPlan: AircraftGuidanceSpeedPlan
) {
  const profileCapFpm =
    candidate.maxVerticalRateFpm ??
    (direction < 0 ? verticalProfile.max_descent_fpm : verticalProfile.max_climb_fpm);

  if (direction <= 0 || mode !== "sid") {
    return profileCapFpm;
  }

  const performance = aircraftPerformanceProfileForGuidance(dataset, aircraft);

  if (!performance) {
    return profileCapFpm;
  }

  let performanceCapFpm = performance.climb_fpm;

  if (aircraft.energy_mode === "expedite_climb") {
    performanceCapFpm =
      typeof performance.expedite_climb_fpm === "number" &&
      Number.isFinite(performance.expedite_climb_fpm)
        ? performance.expedite_climb_fpm
        : performance.climb_fpm * (performance.expedite_climb_rate_factor ?? EXPEDITE_CLIMB_RATE_FACTOR);
  } else if (aircraft.energy_mode === "increase_climb_rate") {
    performanceCapFpm =
      performance.climb_fpm + (performance.increase_rate_step_fpm ?? INCREASE_RATE_STEP_FPM);
  }

  let maxRateFpm = Math.min(profileCapFpm, performanceCapFpm);
  const targetSpeedKt = firstFiniteNumber(
    speedPlan.target_speed_kt,
    aircraft.execution_speed_kt,
    aircraft.assigned?.speed_kt,
    aircraft.managed_speed_kt
  );
  const currentSpeedKt = currentIndicatedSpeedKt(aircraft);

  if (
    typeof targetSpeedKt === "number" &&
    targetSpeedKt > currentSpeedKt + 1 &&
    Number.isFinite(maxRateFpm) &&
    maxRateFpm > 0
  ) {
    let accelerationRateKtSec = performance.accel_kt_sec;

    if (maxRateFpm > 300) {
      accelerationRateKtSec *= performance.climb_accel_factor ?? 0.7;
    }

    if (aircraft.altitude_ft >= (performance.high_altitude_threshold_ft ?? 14000)) {
      accelerationRateKtSec *= performance.high_altitude_accel_factor ?? 0.65;
    }

    const penaltyFpm =
      accelerationRateKtSec *
      (performance.climb_acceleration_vertical_penalty_fpm_per_kt_sec ??
        DEFAULT_CLIMB_ACCEL_VERTICAL_PENALTY_FPM_PER_KT_SEC);
    const minimumClimbRateFpm = Math.min(
      maxRateFpm,
      performance.minimum_capture_vertical_rate_fpm ?? verticalProfile.min_climb_fpm
    );

    maxRateFpm = Math.max(minimumClimbRateFpm, maxRateFpm - Math.max(0, penaltyFpm));
  }

  return Math.max(0, maxRateFpm);
}

function firstFiniteNumber(...values: Array<number | undefined>) {
  return values.find((value): value is number =>
    typeof value === "number" && Number.isFinite(value)
  );
}

function verticalEnergyTargetRateAbsFpm(
  aircraft: AircraftState,
  dataset: RadarDataset,
  mode: AircraftGuidanceMode,
  candidate: AltitudeCandidate,
  speedPlan: AircraftGuidanceSpeedPlan,
  direction: number,
  targetRateAbsFpm: number,
  maxRateFpm: number,
  defaultRateFpm: number
) {
  if (
    candidate.kind === "speed_gate" ||
    candidate.altitudeRole === "landing_profile" ||
    aircraft.approach_phase === "final" ||
    aircraft.approach_phase === "landed"
  ) {
    return targetRateAbsFpm;
  }

  const currentSpeedKt = currentIndicatedSpeedKt(aircraft);
  const performance = aircraftPerformanceProfileForGuidance(dataset, aircraft);
  const increaseRateStepFpm = performance?.increase_rate_step_fpm ?? INCREASE_RATE_STEP_FPM;

  if (direction < 0) {
    if (
      typeof speedPlan.target_speed_kt === "number" &&
      Number.isFinite(speedPlan.target_speed_kt) &&
      speedPlan.target_speed_kt < currentSpeedKt - 1
    ) {
      return targetRateAbsFpm;
    }

    if (aircraft.energy_mode === "expedite_descent") {
      const explicitRateFpm = performance?.expedite_descent_fpm;
      const expeditedRateFpm =
        typeof explicitRateFpm === "number" && Number.isFinite(explicitRateFpm)
          ? explicitRateFpm
          : defaultRateFpm * (performance?.expedite_descent_rate_factor ?? EXPEDITE_DESCENT_RATE_FACTOR);

      return Math.min(maxRateFpm, Math.max(targetRateAbsFpm, expeditedRateFpm));
    }

    if (aircraft.energy_mode === "increase_descent_rate") {
      return Math.min(maxRateFpm, targetRateAbsFpm + increaseRateStepFpm);
    }
  }

  if (direction > 0) {
    if (
      typeof speedPlan.target_speed_kt === "number" &&
      Number.isFinite(speedPlan.target_speed_kt) &&
      speedPlan.target_speed_kt > currentSpeedKt + 1
    ) {
      return targetRateAbsFpm;
    }

    if (aircraft.energy_mode === "expedite_climb") {
      const explicitRateFpm = performance?.expedite_climb_fpm;
      const expeditedRateFpm =
        typeof explicitRateFpm === "number" && Number.isFinite(explicitRateFpm)
          ? explicitRateFpm
          : defaultRateFpm * (performance?.expedite_climb_rate_factor ?? EXPEDITE_CLIMB_RATE_FACTOR);

      return Math.min(maxRateFpm, Math.max(targetRateAbsFpm, expeditedRateFpm));
    }

    if (aircraft.energy_mode === "increase_climb_rate") {
      return Math.min(maxRateFpm, targetRateAbsFpm + increaseRateStepFpm);
    }
  }

  return targetRateAbsFpm;
}

function nextAltitudeCandidate(
  aircraft: AircraftState,
  constraints: AircraftGuidanceConstraint[],
  profile: VerticalProfileRecord,
  mode: AircraftGuidanceMode
): AltitudeCandidate | null {
  const controllerAltitude = constraints.find(
    (constraint) =>
      constraint.kind === "controller_altitude" &&
      typeof constraint.altitude_ft === "number" &&
      Number.isFinite(constraint.altitude_ft)
  );
  const controllerAltitudeCandidate =
    controllerAltitude && typeof controllerAltitude.altitude_ft === "number"
      ? {
          altitudeFt: controllerAltitude.altitude_ft,
          reason: controllerAltitude.source,
          fixId: controllerAltitude.fix_id,
          distanceNm: controllerAltitude.distance_nm,
          maxVerticalRateFpm: controllerAltitude.max_vertical_rate_fpm,
          kind: controllerAltitude.kind,
          altitudeRole: controllerAltitude.altitude_role
        }
      : null;
  const procedureCandidates = constraints
    .filter((constraint) => constraint.kind === "procedure_altitude")
    .map((constraint): AltitudeCandidate | null => {
      const targetAltitudeFt = targetAltitudeForConstraint(aircraft, constraint, profile, mode);

      if (targetAltitudeFt === null) {
        return null;
      }

      return {
        altitudeFt: targetAltitudeFt,
        reason: constraint.source,
        fixId: constraint.fix_id,
        distanceNm: constraint.distance_nm,
        maxVerticalRateFpm: constraint.max_vertical_rate_fpm,
        kind: constraint.kind,
        altitudeRole: constraint.altitude_role
      };
    })
    .filter((candidate): candidate is AltitudeCandidate => candidate !== null);

  procedureCandidates.sort((first, second) => {
    const firstDistance = first.distanceNm ?? Number.POSITIVE_INFINITY;
    const secondDistance = second.distanceNm ?? Number.POSITIVE_INFINITY;

    return firstDistance - secondDistance;
  });
  const speedGateCandidate = speedGateAltitudeCandidate(
    aircraft,
    constraints,
    profile,
    procedureCandidates[0] ?? controllerAltitudeCandidate ?? undefined
  );

  if (speedGateCandidate) {
    return speedGateCandidate;
  }

  if (controllerAltitudeCandidate?.reason === "controller crossing restriction") {
    return controllerAltitudeCandidate;
  }

  if (
    mode === "approach" &&
    controllerAltitudeCandidate &&
    controllerAltitudeCandidate.reason !== "controller crossing restriction" &&
    procedureCandidates.length > 0 &&
    controllerAltitudeCandidate.altitudeFt <= procedureCandidates[0].altitudeFt + 50
  ) {
    const activeProcedureCandidate = procedureCandidates[0];

    return {
      ...controllerAltitudeCandidate,
      fixId: activeProcedureCandidate?.fixId ?? controllerAltitudeCandidate.fixId,
      distanceNm: activeProcedureCandidate?.distanceNm ?? controllerAltitudeCandidate.distanceNm,
      maxVerticalRateFpm:
        activeProcedureCandidate?.maxVerticalRateFpm ?? controllerAltitudeCandidate.maxVerticalRateFpm
    };
  }

  if (procedureCandidates.length > 0) {
    return limitStarViaCandidateToClearance(aircraft, procedureCandidates[0], mode);
  }

  if (controllerAltitudeCandidate) {
    return controllerAltitudeCandidate;
  }

  return null;
}

function starViaDescentClearanceAltitudeFt(aircraft: AircraftState) {
  const clearanceAltitudeFt = aircraft.star_via_clearance_altitude_ft;

  if (typeof clearanceAltitudeFt !== "number" || !Number.isFinite(clearanceAltitudeFt)) {
    return undefined;
  }

  return clearanceAltitudeFt;
}

function limitStarViaCandidateToClearance(
  aircraft: AircraftState,
  candidate: AltitudeCandidate,
  mode: AircraftGuidanceMode
): AltitudeCandidate | null {
  if (mode !== "star_des_via" || aircraft.procedure_kind !== "STAR") {
    return candidate;
  }

  const clearanceAltitudeFt = starViaDescentClearanceAltitudeFt(aircraft);

  if (typeof clearanceAltitudeFt !== "number") {
    return null;
  }

  if (candidate.altitudeFt >= clearanceAltitudeFt) {
    return candidate;
  }

  if (aircraft.altitude_ft <= clearanceAltitudeFt) {
    return null;
  }

  return {
    ...candidate,
    altitudeFt: clearanceAltitudeFt
  };
}

function speedGateAltitudeCandidate(
  aircraft: AircraftState,
  constraints: AircraftGuidanceConstraint[],
  profile: VerticalProfileRecord,
  protectedCandidate?: AltitudeCandidate
): AltitudeCandidate | null {
  const speedGate = constraints.find(
    (constraint) =>
      constraint.kind === "speed_gate" &&
      typeof constraint.altitude_ft === "number" &&
      Number.isFinite(constraint.altitude_ft) &&
      typeof constraint.speed_kt === "number" &&
      Number.isFinite(constraint.speed_kt)
  );

  if (
    !speedGate ||
    typeof speedGate.altitude_ft !== "number" ||
    typeof speedGate.speed_kt !== "number"
  ) {
    return null;
  }

  if (aircraft.altitude_ft <= speedGate.altitude_ft + profile.constraint_capture_ft) {
    return null;
  }

  if (currentIndicatedSpeedKt(aircraft) <= speedGate.speed_kt + 1) {
    return null;
  }

  return {
    altitudeFt: speedGate.altitude_ft,
    reason: speedGate.source,
    fixId: protectedCandidate?.fixId,
    distanceNm: protectedCandidate?.distanceNm,
    kind: "speed_gate",
    altitudeRole: "procedure_default"
  };
}

function verticalProfileStatus(
  direction: number,
  requiredRateFpm: number,
  maxRateFpm: number,
  defaultRateFpm: number
): AircraftGuidanceVerticalPlan["profile_status"] {
  if (direction > 0) {
    return requiredRateFpm > maxRateFpm ? "unable" : "stable";
  }

  if (requiredRateFpm > maxRateFpm) {
    return "too_high";
  }

  if (requiredRateFpm > defaultRateFpm) {
    return "high_but_recoverable";
  }

  return "stable";
}

function approachAdjustedProfileStatus(
  mode: AircraftGuidanceMode,
  candidate: AltitudeCandidate,
  profileStatus: AircraftGuidanceVerticalPlan["profile_status"],
  landingPlan: Partial<AircraftGuidanceVerticalPlan>
): AircraftGuidanceVerticalPlan["profile_status"] {
  if (
    !approachCandidateCanUseLandingFeasibility(mode, candidate) ||
    landingPlan.landing_feasible !== true ||
    profileStatus !== "too_high"
  ) {
    return profileStatus;
  }

  return "high_but_recoverable";
}

function approachCandidateCanUseLandingFeasibility(
  mode: AircraftGuidanceMode,
  candidate: AltitudeCandidate
) {
  if (mode !== "approach") {
    return false;
  }

  return (
    candidate.altitudeRole === "procedure_default" ||
    candidate.altitudeRole === "controller_cleared"
  );
}

function approachRecoverableTargetVerticalRateAbsFpm(
  mode: AircraftGuidanceMode,
  candidate: AltitudeCandidate,
  profileStatus: AircraftGuidanceVerticalPlan["profile_status"],
  landingPlan: Partial<AircraftGuidanceVerticalPlan>,
  direction: number,
  targetRateAbsFpm: number,
  maxRateFpm: number,
  verticalProfile: VerticalProfileRecord
) {
  if (
    direction >= 0 ||
    profileStatus !== "high_but_recoverable" ||
    !approachCandidateCanUseLandingFeasibility(mode, candidate) ||
    landingPlan.landing_feasible !== true ||
    typeof landingPlan.landing_required_vertical_rate_fpm !== "number" ||
    !Number.isFinite(landingPlan.landing_required_vertical_rate_fpm)
  ) {
    return targetRateAbsFpm;
  }

  const landingRequiredRateAbsFpm = Math.abs(landingPlan.landing_required_vertical_rate_fpm);

  if (landingRequiredRateAbsFpm <= 0) {
    return targetRateAbsFpm;
  }

  return Math.min(
    maxRateFpm,
    Math.max(
      verticalProfile.min_descent_fpm,
      landingRequiredRateAbsFpm + APPROACH_RECOVERABLE_DESCENT_BUFFER_FPM
    )
  );
}

function approachLandingFeasibilityPlan(
  aircraft: AircraftState,
  dataset: RadarDataset,
  routeState: RouteState,
  speedPlan: AircraftGuidanceSpeedPlan
): Partial<AircraftGuidanceVerticalPlan> {
  if (
    aircraft.procedure_kind !== "APP" ||
    aircraft.route_mode !== "procedure" ||
    routeState.route.length === 0
  ) {
    return {};
  }

  const thresholdIndex = routeState.route.findIndex((fixId, index) => {
    return index >= routeState.routeIndex && ILS_FINAL_PROFILES[normalizeFixId(fixId)];
  });

  if (thresholdIndex < 0) {
    return {};
  }

  const thresholdFixId = normalizeFixId(routeState.route[thresholdIndex]);
  const finalProfile = ILS_FINAL_PROFILES[thresholdFixId];
  const distanceToThresholdNm = distanceAlongRouteNm(
    aircraft,
    dataset,
    routeState.route,
    routeState.routeIndex,
    thresholdIndex
  );

  if (
    !finalProfile ||
    typeof distanceToThresholdNm !== "number" ||
    !Number.isFinite(distanceToThresholdNm) ||
    distanceToThresholdNm <= 0.1
  ) {
    return {};
  }

  const altitudeDeltaFt = aircraft.altitude_ft - finalProfile.touchdownAltitudeFt;

  if (altitudeDeltaFt <= 0) {
    return {
      landing_feasible: true,
      landing_required_vertical_rate_fpm: 0,
      landing_distance_nm: distanceToThresholdNm
    };
  }

  const speedAdjustedTime = speedAdjustedPlanningTime(
    aircraft,
    speedPlan.target_speed_kt,
    distanceToThresholdNm
  );
  const planningTimeMin =
    typeof speedAdjustedTime?.minutes === "number" && speedAdjustedTime.minutes > 0
      ? speedAdjustedTime.minutes
      : distanceToThresholdNm / (Math.max(aircraft.ground_speed_kt, 60) / 60);
  const requiredRateFpm = planningTimeMin > 0 ? altitudeDeltaFt / planningTimeMin : ILS_FINAL_MAX_DESCENT_FPM;

  return {
    landing_feasible: requiredRateFpm <= ILS_FINAL_MAX_DESCENT_FPM + 1,
    landing_required_vertical_rate_fpm: -requiredRateFpm,
    landing_distance_nm: distanceToThresholdNm
  };
}

function finalGlidepathAltitudeConstraint(
  aircraft: AircraftState,
  dataset: RadarDataset,
  routeState: RouteState
): AircraftGuidanceConstraint | null {
  if (
    aircraft.procedure_kind !== "APP" ||
    aircraft.route_mode !== "procedure" ||
    !routeState.activeFixId
  ) {
    return null;
  }

  const finalProfile = ILS_FINAL_PROFILES[routeState.activeFixId];

  if (!finalProfile) {
    return null;
  }

  const thresholdFix = resolveDirectFix(dataset, routeState.activeFixId);

  if (!thresholdFix) {
    return null;
  }

  const distanceToThresholdNm = distanceNmBetweenPoints(
    aircraft.latitude,
    aircraft.longitude,
    thresholdFix.latitude,
    thresholdFix.longitude
  );

  return {
    kind: "procedure_altitude",
    altitude_role: "landing_profile",
    fix_id: routeState.activeFixId,
    fix_index: routeState.routeIndex,
    distance_nm: distanceToThresholdNm,
    altitude_ft: Math.max(
      finalProfile.touchdownAltitudeFt,
      Math.round(finalProfile.runwayElevationFt + distanceToThresholdNm * ILS_FINAL_GLIDEPATH_FT_PER_NM)
    ),
    max_vertical_rate_fpm: ILS_FINAL_MAX_DESCENT_FPM,
    source: "ILS final glidepath"
  };
}

function targetAltitudeForConstraint(
  aircraft: AircraftState,
  constraint: AircraftGuidanceConstraint,
  profile: VerticalProfileRecord,
  mode: AircraftGuidanceMode
) {
  if (mode === "sid") {
    return sidTargetAltitudeForConstraint(aircraft, constraint, profile);
  }

  const altitudeFt = constraint.altitude_ft;

  if (typeof altitudeFt === "number") {
    if (aircraft.altitude_ft > altitudeFt + profile.constraint_capture_ft) {
      return altitudeFt;
    }

    if (aircraft.altitude_ft < altitudeFt - profile.constraint_capture_ft) {
      return Math.round(aircraft.altitude_ft);
    }

    return altitudeFt;
  }

  if (typeof constraint.max_altitude_ft === "number" && aircraft.altitude_ft > constraint.max_altitude_ft) {
    return constraint.max_altitude_ft;
  }

  if (typeof constraint.min_altitude_ft === "number" && aircraft.altitude_ft > constraint.min_altitude_ft) {
    return constraint.min_altitude_ft;
  }

  return null;
}

function sidTargetAltitudeForConstraint(
  aircraft: AircraftState,
  constraint: AircraftGuidanceConstraint,
  profile: VerticalProfileRecord
) {
  const altitudeFt = constraint.altitude_ft;

  if (typeof altitudeFt === "number") {
    if (aircraft.altitude_ft > altitudeFt + profile.constraint_capture_ft) {
      return null;
    }

    return altitudeFt;
  }

  if (
    typeof constraint.min_altitude_ft === "number" &&
    typeof constraint.max_altitude_ft === "number"
  ) {
    if (aircraft.altitude_ft < constraint.min_altitude_ft - profile.constraint_capture_ft) {
      return constraint.min_altitude_ft;
    }

    if (aircraft.altitude_ft <= constraint.max_altitude_ft + profile.constraint_capture_ft) {
      return constraint.max_altitude_ft;
    }

    return null;
  }

  if (typeof constraint.max_altitude_ft === "number") {
    if (aircraft.altitude_ft > constraint.max_altitude_ft + profile.constraint_capture_ft) {
      return null;
    }

    return constraint.max_altitude_ft;
  }

  if (typeof constraint.min_altitude_ft === "number") {
    if (aircraft.altitude_ft < constraint.min_altitude_ft - profile.constraint_capture_ft) {
      return constraint.min_altitude_ft;
    }
  }

  return null;
}

function requiredVerticalRateFpm(
  altitudeDeltaFt: number,
  distanceNm: number | undefined,
  groundSpeedKt: number,
  fallbackRateFpm: number
) {
  if (
    typeof distanceNm !== "number" ||
    !Number.isFinite(distanceNm) ||
    distanceNm <= 0.1 ||
    !Number.isFinite(groundSpeedKt) ||
    groundSpeedKt <= 0
  ) {
    return fallbackRateFpm;
  }

  const minutesToConstraint = distanceNm / (groundSpeedKt / 60);

  return minutesToConstraint > 0 ? altitudeDeltaFt / minutesToConstraint : fallbackRateFpm;
}

function controllerAltitudeSource(
  aircraft: AircraftState,
  routeState: RouteState,
  verticalProfile: VerticalProfileRecord
) {
  const assignedAltitudeFt = aircraft.assigned?.altitude_ft;

  if (
    aircraft.procedure_kind === "APP" &&
    typeof assignedAltitudeFt === "number" &&
    routeState.activeFixId
  ) {
    const activeApproachConstraint = constraintSetsForAircraft(aircraft, verticalProfile)
      .filter((constraintSet) => constraintSet.procedure_kind === "APP")
      .flatMap((constraintSet) => constraintSet.constraints)
      .find(
        (constraint) =>
          normalizeFixId(constraint.fix_id) === routeState.activeFixId &&
          typeof constraint.altitude_ft === "number" &&
          Math.abs(constraint.altitude_ft - assignedAltitudeFt) <= 50
      );

    if (activeApproachConstraint) {
      return `${routeState.activeFixId} crossing altitude from controller assignment`;
    }
  }

  return "controller assigned altitude";
}

function constraintSetsForAircraft(
  aircraft: AircraftState,
  profile: VerticalProfileRecord
): ProcedureVerticalConstraintSet[] {
  const procedureId = normalizeFixId(aircraft.procedure_id ?? "");

  if (!procedureId) {
    return [];
  }

  return profile.procedure_constraints.filter((constraintSet) => {
    const constraintProcedureId = normalizeFixId(constraintSet.procedure_id);

    return procedureId === constraintProcedureId || procedureId.includes(constraintProcedureId);
  });
}

function sidClimbGradientConstraintsForSet(
  aircraft: AircraftState,
  constraintSet: ProcedureVerticalConstraintSet,
  profile: VerticalProfileRecord
): AircraftGuidanceConstraint[] {
  if (constraintSet.procedure_kind !== "SID" || !Array.isArray(constraintSet.procedure_level_constraints)) {
    return [];
  }

  return constraintSet.procedure_level_constraints
    .filter((constraint) => {
      if (
        constraint.kind !== "climb_gradient" ||
        typeof constraint.climb_gradient_pct !== "number" ||
        !Number.isFinite(constraint.climb_gradient_pct) ||
        constraint.climb_gradient_pct <= 0
      ) {
        return false;
      }

      const requiredUntilAltitudeFt = constraint.required_until_altitude_ft;

      return (
        typeof requiredUntilAltitudeFt !== "number" ||
        !Number.isFinite(requiredUntilAltitudeFt) ||
        aircraft.altitude_ft < requiredUntilAltitudeFt - profile.constraint_capture_ft
      );
    })
    .map((constraint) => {
      const climbGradientPct = constraint.climb_gradient_pct as number;

      return {
        kind: "procedure_climb_gradient" as const,
        climb_gradient_pct: climbGradientPct,
        climb_gradient_purpose: constraint.purpose,
        required_climb_gradient_ft_per_nm: climbGradientPercentToFtPerNm(climbGradientPct),
        required_until_altitude_ft: constraint.required_until_altitude_ft,
        source: constraint.source_text
      };
    });
}

function climbGradientPercentToFtPerNm(climbGradientPct: number) {
  return climbGradientPct * FEET_PER_NM / 100;
}

function hasAltitudeConstraint(constraint: VerticalConstraintRecord) {
  return (
    typeof constraint.altitude_ft === "number" ||
    typeof constraint.min_altitude_ft === "number" ||
    typeof constraint.max_altitude_ft === "number"
  );
}

function procedureAltitudeFieldsForConstraint(
  constraint: VerticalConstraintRecord,
  mode: AircraftGuidanceMode
): Pick<AircraftGuidanceConstraint, "altitude_ft" | "min_altitude_ft" | "max_altitude_ft"> {
  if (mode !== "sid") {
    return {
      altitude_ft: constraint.altitude_ft,
      min_altitude_ft: constraint.min_altitude_ft,
      max_altitude_ft: constraint.max_altitude_ft
    };
  }

  if (constraint.type === "at_or_above") {
    return {
      min_altitude_ft: constraint.altitude_ft ?? constraint.min_altitude_ft
    };
  }

  if (constraint.type === "at_or_below") {
    return {
      max_altitude_ft: constraint.altitude_ft ?? constraint.max_altitude_ft
    };
  }

  return {
    altitude_ft: constraint.altitude_ft,
    min_altitude_ft: constraint.min_altitude_ft,
    max_altitude_ft: constraint.max_altitude_ft
  };
}

function distanceAlongRouteNm(
  aircraft: AircraftState,
  dataset: RadarDataset,
  route: string[],
  routeIndex: number,
  targetFixIndex: number
) {
  let previousPoint = {
    latitude: aircraft.latitude,
    longitude: aircraft.longitude
  };
  let distanceNm = 0;

  for (let index = routeIndex; index <= targetFixIndex; index += 1) {
    const fix = resolveDirectFix(dataset, route[index]);

    if (!fix) {
      return null;
    }

    distanceNm += distanceNmBetweenPoints(
      previousPoint.latitude,
      previousPoint.longitude,
      fix.latitude,
      fix.longitude
    );
    previousPoint = fix;
  }

  return distanceNm;
}

function planningGroundSpeedForAltitudeCandidate(
  aircraft: AircraftState,
  dataset: RadarDataset,
  candidate: AltitudeCandidate,
  wind: WindSettings | undefined
) {
  const fallbackGroundSpeedKt = Number.isFinite(aircraft.ground_speed_kt)
    ? Math.max(1, aircraft.ground_speed_kt)
    : Math.max(1, currentIndicatedSpeedKt(aircraft));

  if (!wind?.enabled || !candidate.fixId) {
    return fallbackGroundSpeedKt;
  }

  const targetFix = resolveDirectFix(dataset, candidate.fixId);

  if (!targetFix) {
    return fallbackGroundSpeedKt;
  }

  const trackToFixDeg = initialBearingTrueDeg(
    aircraft.latitude,
    aircraft.longitude,
    targetFix.latitude,
    targetFix.longitude
  );
  const trueAirspeedKt = groundSpeedFromIndicatedSpeed(
    currentIndicatedSpeedKt(aircraft),
    aircraft.altitude_ft,
    aircraftPerformanceProfileForGuidance(dataset, aircraft)
  );
  const resolvedWind = resolveWindAtAltitude(wind, aircraft.altitude_ft);
  const windCorrectedMotion = windCorrectedMotionForHeading({
    headingTrueDeg: trackToFixDeg,
    trueAirspeedKt,
    wind: resolvedWind,
    holdTrack: true
  });

  return Number.isFinite(windCorrectedMotion.ground_speed_kt) && windCorrectedMotion.ground_speed_kt > 1
    ? windCorrectedMotion.ground_speed_kt
    : fallbackGroundSpeedKt;
}

function aircraftPerformanceProfileForGuidance(
  dataset: RadarDataset,
  aircraft: AircraftState
): AircraftPerformanceProfile | undefined {
  const profiles = dataset.aircraftPerformanceProfiles?.profiles;

  if (!Array.isArray(profiles)) {
    return undefined;
  }

  const aircraftType = aircraft.aircraft_type.toUpperCase();
  const typeMatchedProfile = profiles.find((profile) =>
    profile.aircraft_types.some((type) => type.toUpperCase() === aircraftType)
  );

  if (typeMatchedProfile) {
    return typeMatchedProfile;
  }

  return profiles.find(
    (profile) => profile.id === dataset.aircraftPerformanceProfiles?.default_profile_id
  );
}

function controllerAltitudeTargetForAircraft(
  aircraft: AircraftState,
  dataset: RadarDataset,
  routeState: RouteState,
  activeFixDistanceNm: number | null
) {
  const managedFixId = aircraft.managed_altitude_constraint_fix;

  if (!managedFixId) {
    return {
      fixId: routeState.activeFixId,
      fixIndex: routeState.activeFixId ? routeState.routeIndex : undefined,
      distanceNm: activeFixDistanceNm ?? undefined
    };
  }

  const normalizedManagedFixId = normalizeFixId(managedFixId);
  const route = routeState.route;
  const fixIndex = route.length > 0
    ? routeIndexOfFixAtOrAfter(route, normalizedManagedFixId, routeState.routeIndex)
    : -1;
  const routeDistanceNm = fixIndex >= 0
    ? distanceAlongRouteNm(aircraft, dataset, route, routeState.routeIndex, fixIndex)
    : null;

  if (routeDistanceNm !== null) {
    return {
      fixId: normalizedManagedFixId,
      fixIndex,
      distanceNm: routeDistanceNm,
      managedConstraintActive: true
    };
  }

  return {
    fixId: routeState.activeFixId,
    fixIndex: routeState.activeFixId ? routeState.routeIndex : undefined,
    distanceNm: activeFixDistanceNm ?? undefined,
    managedConstraintActive: false
  };
}

function routeIndexOfFixAtOrAfter(route: string[], fixId: string, startIndex: number) {
  const normalizedFixId = normalizeFixId(fixId);

  for (let index = startIndex; index < route.length; index += 1) {
    if (normalizeFixId(route[index]) === normalizedFixId) {
      return index;
    }
  }

  return -1;
}

function resolveDirectFix(dataset: RadarDataset, fixId: string): DirectFixTarget | null {
  const normalizedFixId = normalizeFixId(fixId);
  const procedureFix = dataset.procedures?.fixes?.find(
    (fix) => normalizeFixId(fix.id) === normalizedFixId
  );

  if (procedureFix) {
    return {
      id: procedureFix.id,
      latitude: procedureFix.latitude,
      longitude: procedureFix.longitude
    };
  }

  const videoLabel = dataset.videomapLabels?.labels?.find(
    (label) => normalizeFixId(label.text) === normalizedFixId
  );

  if (videoLabel) {
    return {
      id: videoLabel.id,
      latitude: videoLabel.latitude,
      longitude: videoLabel.longitude
    };
  }

  const referencePoint = dataset.geometry?.reference_points?.find(
    (point) =>
      normalizeFixId(point.id) === normalizedFixId &&
      typeof point.latitude === "number" &&
      typeof point.longitude === "number"
  );

  if (
    referencePoint &&
    typeof referencePoint.latitude === "number" &&
    typeof referencePoint.longitude === "number"
  ) {
    return {
      id: referencePoint.id,
      latitude: referencePoint.latitude,
      longitude: referencePoint.longitude
    };
  }

  return null;
}

function verticalProcedureMode(aircraft: AircraftState): AircraftVerticalProcedureMode {
  if (aircraft.vertical_procedure_mode) {
    return aircraft.vertical_procedure_mode;
  }

  return aircraft.procedure_kind === "APP" ? "approach" : "cancel_level";
}

function normalizeFixId(fixId: string) {
  return fixId.trim().toUpperCase();
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
