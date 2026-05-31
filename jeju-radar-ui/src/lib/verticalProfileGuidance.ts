import {
  distanceNmBetweenPoints
} from "./aircraftMotion";
import {
  currentIndicatedSpeedKt,
  speedTargetForAutomation
} from "./aircraftSpeedPlanning";
import { flightProfileForDataset } from "./flightProfileGuidance";
import {
  approachLevelRestrictionCanceled,
  speedRestrictionCanceled
} from "./procedureRestrictionState";
import type {
  AircraftVerticalProcedureMode,
  AircraftState,
  FlightProfileRecord,
  ProcedureVerticalConstraintSet,
  RadarDataset,
  VerticalConstraintRecord,
  VerticalProfileRecord
} from "./types";

const FALLBACK_VERTICAL_PROFILE: VerticalProfileRecord = {
  id: "fallback_vertical_training_default",
  glide_path_ft_per_nm: 318,
  constraint_capture_ft: 150,
  min_descent_fpm: 500,
  max_descent_fpm: 2500,
  min_climb_fpm: 500,
  max_climb_fpm: 2200,
  procedure_constraints: []
};

interface DirectFixTarget {
  id: string;
  latitude: number;
  longitude: number;
}

interface ConstraintCandidate {
  constraint: VerticalConstraintRecord;
  fixIndex: number;
  targetAltitudeFt: number;
  distanceToConstraintNm: number;
}

interface SpeedGatePlan {
  targetAltitudeFt: number;
  pendingDescentAltitudeFt: number;
  speedLimitKt: number;
}

export function verticalProfileForDataset(dataset: RadarDataset): VerticalProfileRecord {
  const verticalProfiles = dataset.verticalProfiles;

  return (
    verticalProfiles?.profiles.find(
      (profile) => profile.id === verticalProfiles.default_profile_id
    ) ??
    verticalProfiles?.profiles[0] ??
    FALLBACK_VERTICAL_PROFILE
  );
}

export function applyVerticalProfileGuidance(
  aircraft: AircraftState,
  dataset: RadarDataset,
  currentTimeMs: number
): AircraftState {
  if (
    aircraft.flight_phase !== "arrival" ||
    aircraft.route_mode !== "procedure" ||
    !aircraft.procedure_route?.length ||
    isPending(aircraft.guidance_active_at_ms, currentTimeMs)
  ) {
    return aircraft;
  }

  const profile = verticalProfileForDataset(dataset);
  const procedureMode = verticalProcedureMode(aircraft);
  const speedManagedAircraft = applyActiveConstraintSpeedRestriction(
    aircraft,
    profile
  );
  const starViaClearanceAltitudeFt = starViaDescentClearanceAltitudeFt(speedManagedAircraft);

  if (
    procedureMode === "cancel_level" ||
    procedureMode === "controller" ||
    speedManagedAircraft.altitude_control_mode === "controller" ||
    speedManagedAircraft.vertical_rate_control_mode === "controller"
  ) {
    return clearManagedAltitude(speedManagedAircraft);
  }

  if (
    procedureMode === "des_via" &&
    speedManagedAircraft.procedure_kind === "STAR" &&
    typeof starViaClearanceAltitudeFt !== "number"
  ) {
    return clearManagedAltitude(speedManagedAircraft);
  }

  const candidate = nextConstraintCandidate(speedManagedAircraft, dataset, profile, procedureMode);

  if (!candidate) {
    return clearManagedAltitude(speedManagedAircraft, {
      preserveExhaustedDescentTarget: procedureMode === "des_via"
    });
  }
  const approachFloorLimitedCandidate = applyApproachTransitionFloor(
    speedManagedAircraft,
    profile,
    candidate,
    procedureMode
  );
  const altitudeLimitedCandidate =
    procedureMode === "des_via" &&
    speedManagedAircraft.procedure_kind === "STAR" &&
    typeof starViaClearanceAltitudeFt === "number"
      ? limitCandidateToStarViaClearance(
          approachFloorLimitedCandidate,
          starViaClearanceAltitudeFt,
          speedManagedAircraft.altitude_ft
        )
      : approachFloorLimitedCandidate;

  if (!altitudeLimitedCandidate) {
    return clearManagedAltitude(speedManagedAircraft);
  }

  const speedGatePlan = speedGatePlanForConstraint(
    speedManagedAircraft,
    altitudeLimitedCandidate,
    flightProfileForDataset(dataset)
  );
  const effectiveCandidate = speedGatePlan
    ? {
        ...altitudeLimitedCandidate,
        targetAltitudeFt: speedGatePlan.targetAltitudeFt
      }
    : altitudeLimitedCandidate;
  const verticalRatePlan = verticalRateForConstraint(speedManagedAircraft, effectiveCandidate, profile);
  let executionSpeedKt = speedManagedAircraft.execution_speed_kt;
  const candidateSpeedRestrictionActive =
    typeof candidate.constraint.speed_kt === "number" &&
    Number.isFinite(candidate.constraint.speed_kt) &&
    !speedRestrictionCanceled(speedManagedAircraft, candidate.constraint.fix_id);

  if (
    candidateSpeedRestrictionActive &&
    speedManagedAircraft.speed_control_mode !== "controller"
  ) {
    executionSpeedKt = candidate.constraint.speed_kt;
  }

  if (speedGatePlan && speedManagedAircraft.speed_control_mode !== "controller") {
    const currentSpeedKt = currentIndicatedSpeedKt(speedManagedAircraft);
    const existingSpeedTargetKt = speedTargetForAutomation(
      {
        ...speedManagedAircraft,
        execution_speed_kt: executionSpeedKt
      },
      currentSpeedKt
    );

    executionSpeedKt = Math.min(existingSpeedTargetKt, currentSpeedKt, speedGatePlan.speedLimitKt);
  }

  return {
    ...speedManagedAircraft,
    execution_altitude_ft: verticalRatePlan.holdCurrentAltitude
      ? Math.round(speedManagedAircraft.altitude_ft)
      : effectiveCandidate.targetAltitudeFt,
    execution_vertical_rate_fpm: verticalRatePlan.verticalRateFpm,
    execution_speed_kt: executionSpeedKt,
    altitude_control_mode: "managed",
    vertical_rate_control_mode: "managed",
    managed_altitude_constraint_fix: normalizeFixId(candidate.constraint.fix_id),
    managed_altitude_constraint_ft: effectiveCandidate.targetAltitudeFt,
    managed_vertical_rate_fpm: verticalRatePlan.verticalRateFpm,
    pending_descent_altitude_ft: speedGatePlan?.pendingDescentAltitudeFt,
    managed_speed_kt:
      typeof executionSpeedKt === "number"
        ? executionSpeedKt
        : candidateSpeedRestrictionActive
          ? candidate.constraint.speed_kt
          : aircraft.managed_speed_kt
  };
}

function nextConstraintCandidate(
  aircraft: AircraftState,
  dataset: RadarDataset,
  profile: VerticalProfileRecord,
  procedureMode: AircraftVerticalProcedureMode
): ConstraintCandidate | null {
  const matchingSets = constraintSetsForAircraft(aircraft, profile);
  const route = aircraft.procedure_route?.map(normalizeFixId) ?? [];
  const routeIndex = clampNumber(aircraft.procedure_route_index ?? 0, 0, Math.max(0, route.length - 1));
  const activeApproachConstraint = activeApproachConstraintForCurrentFix(
    aircraft,
    dataset,
    matchingSets,
    profile,
    route,
    routeIndex,
    procedureMode
  );

  if (activeApproachConstraint !== undefined) {
    return activeApproachConstraint;
  }

  const activeCarryForwardConstraint = activeCarryForwardAtConstraint(
    aircraft,
    dataset,
    matchingSets,
    profile,
    route,
    routeIndex,
    procedureMode
  );

  if (activeCarryForwardConstraint) {
    return activeCarryForwardConstraint;
  }

  const candidates: ConstraintCandidate[] = [];

  for (const constraintSet of matchingSets) {
    if (blocksFurtherDescentByAtOrAboveFloor(aircraft, route, routeIndex, constraintSet, profile, procedureMode)) {
      continue;
    }

    for (const constraint of constraintSet.constraints) {
      if (
        aircraft.procedure_kind === "APP" &&
        approachLevelRestrictionCanceled(aircraft, constraint.fix_id)
      ) {
        continue;
      }

      const fixIndex = routeIndexOfFixAtOrAfter(route, constraint.fix_id, routeIndex);

      if (fixIndex < 0) {
        continue;
      }

      const targetAltitudeFt = targetAltitudeForConstraint(
        constraint,
        aircraft.altitude_ft,
        profile.constraint_capture_ft,
        procedureMode
      );

      if (targetAltitudeFt === null) {
        continue;
      }

      const distanceToConstraintNm = distanceAlongRouteNm(aircraft, dataset, route, routeIndex, fixIndex);

      if (distanceToConstraintNm === null) {
        continue;
      }

      candidates.push({
        constraint,
        fixIndex,
        targetAltitudeFt,
        distanceToConstraintNm
      });
    }
  }

  candidates.sort((first, second) => {
    if (first.fixIndex !== second.fixIndex) {
      return first.fixIndex - second.fixIndex;
    }

    return constraintPriority(first.constraint) - constraintPriority(second.constraint);
  });

  return candidates[0] ?? null;
}

function activeApproachConstraintForCurrentFix(
  aircraft: AircraftState,
  dataset: RadarDataset,
  matchingSets: ProcedureVerticalConstraintSet[],
  profile: VerticalProfileRecord,
  route: string[],
  routeIndex: number,
  procedureMode: AircraftVerticalProcedureMode
): ConstraintCandidate | null | undefined {
  if (
    procedureMode !== "approach" ||
    aircraft.procedure_kind !== "APP" ||
    aircraft.route_mode !== "procedure"
  ) {
    return undefined;
  }

  const activeFixId = route[routeIndex];

  if (!activeFixId) {
    return undefined;
  }

  const activeConstraints = matchingSets
    .filter((constraintSet) => constraintSet.procedure_kind === "APP")
    .flatMap((constraintSet) => constraintSet.constraints)
    .filter(
      (constraint) =>
        normalizeFixId(constraint.fix_id) === activeFixId &&
        !approachLevelRestrictionCanceled(aircraft, constraint.fix_id)
    );

  if (activeConstraints.length === 0) {
    return undefined;
  }

  const activeCandidates = activeConstraints
    .map((constraint) => {
      const targetAltitudeFt = targetAltitudeForConstraint(
        constraint,
        aircraft.altitude_ft,
        profile.constraint_capture_ft,
        procedureMode
      );

      if (targetAltitudeFt === null) {
        return null;
      }
      const effectiveTargetAltitudeFt =
        approachControllerAltitudeOverrideForConstraint(
          aircraft,
          constraint,
          targetAltitudeFt,
          profile.constraint_capture_ft
        ) ?? targetAltitudeFt;

      return {
        constraint,
        fixIndex: routeIndex,
        targetAltitudeFt: effectiveTargetAltitudeFt,
        distanceToConstraintNm:
          distanceAlongRouteNm(aircraft, dataset, route, routeIndex, routeIndex) ?? 0
      };
    })
    .filter((candidate): candidate is ConstraintCandidate => candidate !== null);

  activeCandidates.sort((first, second) => constraintPriority(first.constraint) - constraintPriority(second.constraint));

  return activeCandidates[0] ?? null;
}

function activeCarryForwardAtConstraint(
  aircraft: AircraftState,
  dataset: RadarDataset,
  matchingSets: ProcedureVerticalConstraintSet[],
  profile: VerticalProfileRecord,
  route: string[],
  routeIndex: number,
  procedureMode: AircraftVerticalProcedureMode
): ConstraintCandidate | null {
  if (procedureMode !== "des_via" || aircraft.procedure_kind !== "STAR") {
    return null;
  }

  const activeFixId = route[routeIndex] ?? aircraft.next_fix;

  if (!activeFixId) {
    return null;
  }

  for (const constraintSet of matchingSets) {
    const activeConstraint = nearestPriorAtAltitudeConstraint(route, routeIndex, constraintSet);

    if (!activeConstraint) {
      continue;
    }

    const distanceToConstraintNm =
      activeConstraint.fixIndex === routeIndex
        ? distanceAlongRouteNm(aircraft, dataset, route, routeIndex, routeIndex) ?? 0.1
        : 0.1;
    const speedKt = activeOrPriorRouteSpeedLimitKt(aircraft, matchingSets, activeFixId);
    const targetAltitudeFt =
      aircraft.altitude_ft >= activeConstraint.constraint.altitude_ft
        ? activeConstraint.constraint.altitude_ft
        : Math.round(aircraft.altitude_ft);

    return {
      constraint: {
        ...activeConstraint.constraint,
        fix_id: activeFixId,
        speed_kt: speedKt ?? activeConstraint.constraint.speed_kt,
        source_text: `${activeConstraint.constraint.source_text}; carried forward by AIP '-' coding to ${activeFixId}`
      },
      fixIndex: routeIndex,
      targetAltitudeFt,
      distanceToConstraintNm: Math.max(0.1, distanceToConstraintNm)
    };
  }

  return null;
}

function nearestPriorAtAltitudeConstraint(
  route: string[],
  routeIndex: number,
  constraintSet: ProcedureVerticalConstraintSet
) {
  let selected: { constraint: VerticalConstraintRecord & { altitude_ft: number }; fixIndex: number } | null = null;

  for (const constraint of constraintSet.constraints) {
    if (constraint.type !== "at" || typeof constraint.altitude_ft !== "number") {
      continue;
    }

    const fixIndex = route.indexOf(normalizeFixId(constraint.fix_id));

    if (fixIndex < 0 || fixIndex > routeIndex) {
      continue;
    }

    const nextAltitudeIndex = nextExplicitAltitudeConstraintIndex(route, constraintSet, fixIndex);

    if (routeIndex >= nextAltitudeIndex) {
      continue;
    }

    if (!selected || fixIndex > selected.fixIndex) {
      selected = {
        constraint: constraint as VerticalConstraintRecord & { altitude_ft: number },
        fixIndex
      };
    }
  }

  return selected;
}

function nextExplicitAltitudeConstraintIndex(
  route: string[],
  constraintSet: ProcedureVerticalConstraintSet,
  fromFixIndex: number
) {
  let nextIndex = route.length;

  for (const constraint of constraintSet.constraints) {
    if (!hasExplicitAltitudeConstraint(constraint)) {
      continue;
    }

    const fixIndex = route.indexOf(normalizeFixId(constraint.fix_id));

    if (fixIndex > fromFixIndex && fixIndex < nextIndex) {
      nextIndex = fixIndex;
    }
  }

  return nextIndex;
}

function hasExplicitAltitudeConstraint(constraint: VerticalConstraintRecord) {
  return (
    typeof constraint.altitude_ft === "number" ||
    typeof constraint.min_altitude_ft === "number" ||
    typeof constraint.max_altitude_ft === "number"
  );
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

function targetAltitudeForConstraint(
  constraint: VerticalConstraintRecord,
  currentAltitudeFt: number,
  captureFt: number,
  procedureMode: AircraftVerticalProcedureMode
) {
  const altitudeFt = constraint.altitude_ft;

  if (constraint.type === "at" && typeof altitudeFt === "number") {
    return currentAltitudeFt > altitudeFt + captureFt ? altitudeFt : null;
  }

  if (constraint.type === "at_or_below" && typeof altitudeFt === "number") {
    return currentAltitudeFt > altitudeFt + captureFt ? altitudeFt : null;
  }

  if (constraint.type === "at_or_above" && typeof altitudeFt === "number") {
    if (procedureMode === "approach" || procedureMode === "des_via") {
      return currentAltitudeFt > altitudeFt + captureFt ? altitudeFt : null;
    }

    return null;
  }

  if (constraint.type === "window") {
    if (
      typeof constraint.max_altitude_ft === "number" &&
      currentAltitudeFt > constraint.max_altitude_ft + captureFt
    ) {
      return constraint.max_altitude_ft;
    }

    return null;
  }

  return null;
}

function approachControllerAltitudeOverrideForConstraint(
  aircraft: AircraftState,
  constraint: VerticalConstraintRecord,
  defaultTargetAltitudeFt: number,
  captureFt: number
) {
  if (aircraft.procedure_kind !== "APP") {
    return undefined;
  }

  const assignedAltitudeFt = aircraft.assigned?.altitude_ft;
  const constraintAltitudeFt =
    typeof constraint.altitude_ft === "number" ? constraint.altitude_ft : defaultTargetAltitudeFt;

  if (
    typeof assignedAltitudeFt !== "number" ||
    !Number.isFinite(assignedAltitudeFt) ||
    !Number.isFinite(constraintAltitudeFt)
  ) {
    return undefined;
  }

  if (assignedAltitudeFt > constraintAltitudeFt + 50) {
    return undefined;
  }

  if (aircraft.altitude_ft < assignedAltitudeFt - captureFt) {
    return Math.round(aircraft.altitude_ft);
  }

  return assignedAltitudeFt;
}

function applyActiveConstraintSpeedRestriction(
  aircraft: AircraftState,
  profile: VerticalProfileRecord
): AircraftState {
  if (aircraft.speed_control_mode === "controller") {
    return aircraft;
  }

  const activeFixId = activeTargetFixId(aircraft);

  if (!activeFixId) {
    return aircraft;
  }

  const speedLimitKt = activeOrPriorRouteSpeedLimitKt(
    aircraft,
    constraintSetsForAircraft(aircraft, profile),
    activeFixId
  );

  if (typeof speedLimitKt !== "number") {
    return aircraft;
  }

  return {
    ...aircraft,
    execution_speed_kt: speedLimitKt,
    managed_speed_kt: speedLimitKt
  };
}

function activeOrPriorRouteSpeedLimitKt(
  aircraft: AircraftState,
  matchingSets: ProcedureVerticalConstraintSet[],
  activeFixId: string
) {
  const constraintsWithSpeed = matchingSets
    .flatMap((constraintSet) => constraintSet.constraints)
    .filter(
      (constraint) =>
        typeof constraint.speed_kt === "number" &&
        Number.isFinite(constraint.speed_kt) &&
        !speedRestrictionCanceled(aircraft, constraint.fix_id)
    );
  const exactSpeedLimits = constraintsWithSpeed
    .filter((constraint) => normalizeFixId(constraint.fix_id) === normalizeFixId(activeFixId))
    .map((constraint) => constraint.speed_kt as number);

  if (exactSpeedLimits.length > 0) {
    return Math.min(...exactSpeedLimits);
  }

  if (aircraft.route_mode !== "procedure" || !aircraft.procedure_route?.length) {
    return undefined;
  }

  const route = aircraft.procedure_route.map(normalizeFixId);
  const routeIndex = clampNumber(aircraft.procedure_route_index ?? 0, 0, Math.max(0, route.length - 1));
  const activeFixIndex = routeIndexOfFixAtOrAfter(route, activeFixId, routeIndex);

  if (activeFixIndex < 0) {
    return undefined;
  }

  let nearestConstraintIndex = -1;
  let speedLimitKt: number | undefined;

  for (const constraint of constraintsWithSpeed) {
    const constraintIndex = route.indexOf(normalizeFixId(constraint.fix_id));

    if (constraintIndex < 0 || constraintIndex > activeFixIndex || constraintIndex < nearestConstraintIndex) {
      continue;
    }

    if (constraintIndex > nearestConstraintIndex) {
      nearestConstraintIndex = constraintIndex;
      speedLimitKt = constraint.speed_kt as number;
      continue;
    }

    speedLimitKt = Math.min(speedLimitKt ?? constraint.speed_kt, constraint.speed_kt as number);
  }

  return speedLimitKt;
}

function clearManagedAltitude(
  aircraft: AircraftState,
  options: { preserveExhaustedDescentTarget?: boolean } = {}
): AircraftState {
  const preserveApproachExecutionTarget =
    aircraft.procedure_kind === "APP" &&
    verticalProcedureMode(aircraft) === "approach" &&
    aircraft.altitude_control_mode !== "controller" &&
    aircraft.vertical_rate_control_mode !== "controller";
  const exhaustedDescentTargetFt = options.preserveExhaustedDescentTarget
    ? exhaustedManagedDescentTargetFt(aircraft)
    : undefined;
  const preserveExhaustedDescentTarget =
    typeof exhaustedDescentTargetFt === "number" && Number.isFinite(exhaustedDescentTargetFt);
  const preserveExecutionTarget = preserveApproachExecutionTarget || preserveExhaustedDescentTarget;

  return {
    ...aircraft,
    execution_altitude_ft: preserveExhaustedDescentTarget
      ? exhaustedDescentTargetFt
      : preserveApproachExecutionTarget
        ? aircraft.execution_altitude_ft
        : undefined,
    execution_vertical_rate_fpm: preserveExhaustedDescentTarget
      ? 0
      : preserveApproachExecutionTarget
      ? aircraft.execution_vertical_rate_fpm
      : undefined,
    managed_altitude_constraint_fix: undefined,
    managed_altitude_constraint_ft: undefined,
    managed_vertical_rate_fpm: preserveExecutionTarget ? 0 : undefined,
    pending_descent_altitude_ft: undefined
  };
}

function starViaDescentClearanceAltitudeFt(aircraft: AircraftState) {
  const clearanceAltitudeFt = aircraft.star_via_clearance_altitude_ft;

  if (typeof clearanceAltitudeFt !== "number" || !Number.isFinite(clearanceAltitudeFt)) {
    return undefined;
  }

  return clearanceAltitudeFt;
}

function limitCandidateToStarViaClearance(
  candidate: ConstraintCandidate,
  clearanceAltitudeFt: number,
  currentAltitudeFt: number
): ConstraintCandidate | null {
  if (candidate.targetAltitudeFt >= clearanceAltitudeFt) {
    return candidate;
  }

  if (currentAltitudeFt <= clearanceAltitudeFt) {
    return null;
  }

  return {
    ...candidate,
    targetAltitudeFt: clearanceAltitudeFt
  };
}

function blocksFurtherDescentByAtOrAboveFloor(
  aircraft: AircraftState,
  route: string[],
  routeIndex: number,
  constraintSet: ProcedureVerticalConstraintSet,
  profile: VerticalProfileRecord,
  procedureMode: AircraftVerticalProcedureMode
) {
  if (procedureMode !== "des_via" || aircraft.procedure_kind !== "STAR") {
    return false;
  }

  for (const constraint of constraintSet.constraints) {
    if (constraint.type !== "at_or_above" || typeof constraint.altitude_ft !== "number") {
      continue;
    }

    const fixIndex = routeIndexOfFixAtOrAfter(route, constraint.fix_id, routeIndex);

    if (fixIndex < 0) {
      continue;
    }

    if (aircraft.altitude_ft <= constraint.altitude_ft + profile.constraint_capture_ft) {
      return true;
    }
  }

  return false;
}

function applyApproachTransitionFloor(
  aircraft: AircraftState,
  profile: VerticalProfileRecord,
  candidate: ConstraintCandidate,
  procedureMode: AircraftVerticalProcedureMode
): ConstraintCandidate {
  const floorAltitudeFt = approachTransitionFloorAltitudeFt(aircraft, profile, procedureMode);

  if (typeof floorAltitudeFt !== "number" || candidate.targetAltitudeFt >= floorAltitudeFt) {
    return candidate;
  }

  return {
    ...candidate,
    targetAltitudeFt: floorAltitudeFt
  };
}

function approachTransitionFloorAltitudeFt(
  aircraft: AircraftState,
  profile: VerticalProfileRecord,
  procedureMode: AircraftVerticalProcedureMode
) {
  const transition = aircraft.procedure_capture_transition;

  if (
    procedureMode !== "approach" ||
    aircraft.procedure_kind !== "APP" ||
    !transition ||
    aircraft.route_mode !== "procedure" ||
    !aircraft.procedure_route?.length
  ) {
    return undefined;
  }

  const route = aircraft.procedure_route.map(normalizeFixId);
  const routeIndex = clampNumber(aircraft.procedure_route_index ?? 0, 0, Math.max(0, route.length - 1));
  const activeFixId = normalizeFixId(transition.active_fix_id);
  const nextFixId = normalizeFixId(transition.next_fix_id);

  if (route[routeIndex] !== nextFixId || route.indexOf(activeFixId) < 0) {
    return undefined;
  }

  const floorAltitudesFt = constraintSetsForAircraft(aircraft, profile)
    .flatMap((constraintSet) => constraintSet.constraints)
    .filter((constraint) => normalizeFixId(constraint.fix_id) === activeFixId)
    .filter((constraint) => !approachLevelRestrictionCanceled(aircraft, constraint.fix_id))
    .map((constraint) => {
      if (
        (constraint.type === "at" || constraint.type === "at_or_above") &&
        typeof constraint.altitude_ft === "number"
      ) {
        return constraint.altitude_ft;
      }

      if (
        constraint.type === "window" &&
        typeof constraint.min_altitude_ft === "number"
      ) {
        return constraint.min_altitude_ft;
      }

      return undefined;
    })
    .filter((altitudeFt): altitudeFt is number => typeof altitudeFt === "number");

  return floorAltitudesFt.length > 0 ? Math.max(...floorAltitudesFt) : undefined;
}

function exhaustedManagedDescentTargetFt(aircraft: AircraftState) {
  const currentAltitudeFt = Math.round(aircraft.altitude_ft);
  const previousTargetFt =
    typeof aircraft.execution_altitude_ft === "number" && Number.isFinite(aircraft.execution_altitude_ft)
      ? aircraft.execution_altitude_ft
      : typeof aircraft.managed_altitude_constraint_ft === "number" &&
          Number.isFinite(aircraft.managed_altitude_constraint_ft)
        ? aircraft.managed_altitude_constraint_ft
        : undefined;

  if (typeof previousTargetFt !== "number") {
    return undefined;
  }

  return Math.min(currentAltitudeFt, previousTargetFt);
}

function verticalProcedureMode(aircraft: AircraftState): AircraftVerticalProcedureMode {
  if (aircraft.vertical_procedure_mode) {
    return aircraft.vertical_procedure_mode;
  }

  return aircraft.procedure_kind === "APP" ? "approach" : "cancel_level";
}

function activeTargetFixId(aircraft: AircraftState) {
  if (aircraft.route_mode === "direct") {
    return aircraft.next_fix;
  }

  if (aircraft.route_mode !== "procedure" || !aircraft.procedure_route?.length) {
    return undefined;
  }

  return aircraft.procedure_route[aircraft.procedure_route_index ?? 0] ?? aircraft.next_fix;
}

function speedGatePlanForConstraint(
  aircraft: AircraftState,
  candidate: ConstraintCandidate,
  flightProfile: FlightProfileRecord
): SpeedGatePlan | null {
  const gate = flightProfile.arrival.speed_gate;
  const currentSpeedKt = currentIndicatedSpeedKt(aircraft);
  const releaseSpeedKt = gate.max_speed_kt + (gate.release_margin_kt ?? 0);

  if (
    candidate.targetAltitudeFt >= gate.altitude_ft ||
    aircraft.altitude_ft <= gate.altitude_ft ||
    currentSpeedKt <= releaseSpeedKt
  ) {
    return null;
  }

  return {
    targetAltitudeFt: gate.altitude_ft,
    pendingDescentAltitudeFt: candidate.targetAltitudeFt,
    speedLimitKt: gate.max_speed_kt
  };
}

function verticalRateForConstraint(
  aircraft: AircraftState,
  candidate: ConstraintCandidate,
  profile: VerticalProfileRecord
) {
  const altitudeDeltaFt = candidate.targetAltitudeFt - aircraft.altitude_ft;

  if (Math.abs(altitudeDeltaFt) <= profile.constraint_capture_ft) {
    return {
      holdCurrentAltitude: false,
      verticalRateFpm: 0
    };
  }

  const direction = Math.sign(altitudeDeltaFt);
  const groundSpeedKt = Math.max(0, aircraft.ground_speed_kt);

  if (!Number.isFinite(groundSpeedKt) || groundSpeedKt <= 0 || candidate.distanceToConstraintNm <= 0.1) {
    return {
      holdCurrentAltitude: false,
      verticalRateFpm: direction < 0 ? -profile.max_descent_fpm : profile.max_climb_fpm
    };
  }

  const minutesToConstraint = candidate.distanceToConstraintNm / (groundSpeedKt / 60);
  const requiredRateFpm =
    minutesToConstraint > 0
      ? Math.abs(altitudeDeltaFt) / minutesToConstraint
      : direction < 0
        ? profile.max_descent_fpm
        : profile.max_climb_fpm;

  if (direction < 0 && requiredRateFpm < profile.min_descent_fpm) {
    return {
      holdCurrentAltitude: true,
      verticalRateFpm: 0
    };
  }

  const clampedRateFpm =
    direction < 0
      ? clampNumber(requiredRateFpm, profile.min_descent_fpm, profile.max_descent_fpm)
      : clampNumber(requiredRateFpm, profile.min_climb_fpm, profile.max_climb_fpm);

  return {
    holdCurrentAltitude: false,
    verticalRateFpm: direction * clampedRateFpm
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
  const procedureFix = dataset.procedures.fixes.find(
    (fix) => normalizeFixId(fix.id) === normalizedFixId
  );

  if (procedureFix) {
    return {
      id: procedureFix.id,
      latitude: procedureFix.latitude,
      longitude: procedureFix.longitude
    };
  }

  const videoLabel = dataset.videomapLabels.labels.find(
    (label) => normalizeFixId(label.text) === normalizedFixId
  );

  if (videoLabel) {
    return {
      id: videoLabel.id,
      latitude: videoLabel.latitude,
      longitude: videoLabel.longitude
    };
  }

  const referencePoint = dataset.geometry.reference_points.find(
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

function constraintPriority(constraint: VerticalConstraintRecord) {
  if (constraint.type === "at") {
    return 0;
  }

  if (constraint.type === "window") {
    return 1;
  }

  if (constraint.type === "at_or_below") {
    return 2;
  }

  return 3;
}

function normalizeFixId(fixId: string) {
  return fixId.trim().toUpperCase();
}

function isPending(activeAtMs: number | undefined, currentTimeMs: number) {
  return typeof activeAtMs === "number" && currentTimeMs < activeAtMs;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
