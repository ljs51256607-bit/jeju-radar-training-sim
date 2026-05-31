import {
  type AircraftMotionOptions,
  advanceAircraftForRadarSweep,
  distanceNmBetweenPoints,
  distanceNmForSeconds,
  initialBearingTrueDeg
} from "./aircraftMotion";
import { applyAircraftGuidancePipeline } from "./aircraftGuidancePipeline";
import { buildAircraftGuidancePlan } from "./aircraftGuidancePlanner";
import { currentIndicatedSpeedKt } from "./flightProfileGuidance";
import {
  HOLDING_FIX_CAPTURE_DISTANCE_NM,
  HOLDING_TURN_CAPTURE_HEADING_DEG,
  holdingEntryTargetHeading,
  holdingOutboundHeading,
  holdingPatternForAircraft,
  holdingPatternForFix,
  holdingPhaseDurationMs,
  holdingStateAtFix,
  nextHoldingTimedPhase,
  shortestHeadingDelta
} from "./holdingPatterns";
import { MISSED_APPROACH_PROCEDURE_ID_PREFIX } from "./missedApproachProfiles";
import { approachLevelRestrictionCanceled } from "./procedureRestrictionState";
import { conventionalSidRuntimeFix } from "./conventionalSidRuntimeRoutes";
import type {
  AircraftHoldingState,
  AircraftState,
  HoldingPattern,
  HoldingPhase,
  ProcedureCaptureTransitionState,
  RadarDataset
} from "./types";

export interface DirectFixTarget {
  id: string;
  latitude: number;
  longitude: number;
}

interface IlsApproachProfile {
  procedureId: string;
  runway: string;
  route: string[];
  finalFix: string;
  thresholdFix: string;
  runwayElevationFt: number;
  crossingAltitudesFt: Record<string, number>;
  finalSpeedKt: number;
  minDescentFpm: number;
  maxDescentFpm: number;
  touchdownAltitudeFt: number;
  localizerLeadMinNm: number;
  localizerLeadMaxNm: number;
}

const LOCALIZER_LEAD_SECONDS = 85;
const PROCEDURE_CAPTURE_TRANSITION_DURATION_MS = 6_000;
const HOLDING_FIX_REJOIN_DISTANCE_NM = 6;
const ILS_APPROACH_PROFILES: IlsApproachProfile[] = [
  {
    procedureId: "ILS_Z_LOC_Z_RWY_07",
    runway: "07",
    route: ["YUMIN", "LIMSO", "RW070"],
    finalFix: "LIMSO",
    thresholdFix: "RW070",
    runwayElevationFt: 87,
    crossingAltitudesFt: {
      YUMIN: 4000,
      LIMSO: 2900
    },
    finalSpeedKt: 160,
    minDescentFpm: 500,
    maxDescentFpm: 1500,
    touchdownAltitudeFt: 120,
    localizerLeadMinNm: 3.2,
    localizerLeadMaxNm: 5.8
  },
  {
    procedureId: "ILS_Z_LOC_Z_RWY_25",
    runway: "25",
    route: ["DUKAL", "TOKIN", "RW250"],
    finalFix: "TOKIN",
    thresholdFix: "RW250",
    runwayElevationFt: 76,
    crossingAltitudesFt: {
      DUKAL: 4000,
      TOKIN: 2900
    },
    finalSpeedKt: 160,
    minDescentFpm: 500,
    maxDescentFpm: 1500,
    touchdownAltitudeFt: 120,
    localizerLeadMinNm: 3.2,
    localizerLeadMaxNm: 5.8
  }
];

function advanceAircraftWithFlightProfile(
  aircraft: AircraftState,
  dataset: RadarDataset,
  elapsedSeconds: number,
  options: AircraftMotionOptions = {}
) {
  const currentTimeMs = options.currentTimeMs ?? Date.now();
  const guidanceStatusAircraft = applyAircraftGuidancePipeline(aircraft, dataset, currentTimeMs, {
    wind: options.wind
  });

  return advanceAircraftForRadarSweep(
    guidanceStatusAircraft,
    elapsedSeconds,
    options
  );
}

interface LocalizerGeometry {
  profile: IlsApproachProfile;
  finalFix: DirectFixTarget;
  thresholdFix: DirectFixTarget;
  courseTrueDeg: number;
  courseLengthNm: number;
  alongNm: number;
  lateralNm: number;
  unitX: number;
  unitY: number;
}

function normalizeFixId(fixId: string) {
  return fixId.trim().toUpperCase();
}

export function activeRouteTargetFixId(aircraft: AircraftState) {
  if (aircraft.route_mode === "direct") {
    return aircraft.next_fix;
  }

  if (aircraft.route_mode !== "procedure" || !aircraft.procedure_route?.length) {
    return undefined;
  }

  const routeIndex = aircraft.procedure_route_index ?? 0;

  return aircraft.procedure_route[routeIndex];
}

export function resolveDirectFix(dataset: RadarDataset, fixId: string): DirectFixTarget | null {
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

  const conventionalSidFix = conventionalSidRuntimeFix(dataset, normalizedFixId);

  if (conventionalSidFix) {
    return conventionalSidFix;
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

export function guideAircraftAlongRoute(
  aircraft: AircraftState,
  dataset: RadarDataset,
  elapsedSeconds: number,
  options: AircraftMotionOptions = {}
): AircraftState {
  const currentTimeMs = options.currentTimeMs ?? Date.now();
  let aircraftWithApproachProfile = applyIlsApproachProfile(
    aircraft,
    dataset,
    currentTimeMs
  );
  aircraftWithApproachProfile = clearStaleProcedureCaptureTransition(
    aircraftWithApproachProfile
  );

  const transitionedAircraft = advanceProcedureCaptureTransition(
    aircraftWithApproachProfile,
    dataset,
    elapsedSeconds,
    options
  );

  if (transitionedAircraft) {
    return transitionedAircraft;
  }

  if (aircraftWithApproachProfile.route_mode === "hold") {
    return advanceAircraftInHold(
      aircraftWithApproachProfile,
      dataset,
      elapsedSeconds,
      options
    );
  }

  const targetFixId = activeRouteTargetFixId(aircraftWithApproachProfile);

  if (!targetFixId || isPending(aircraftWithApproachProfile.guidance_active_at_ms, currentTimeMs)) {
    return advanceAircraftWithFlightProfile(aircraftWithApproachProfile, dataset, elapsedSeconds, options);
  }

  const targetFix = resolveDirectFix(dataset, targetFixId);

  if (!targetFix) {
    return advanceAircraftWithFlightProfile({
      ...aircraftWithApproachProfile,
      route_mode: "vector",
      next_fix: undefined,
      procedure_id: undefined,
      procedure_name: undefined,
      procedure_kind: undefined,
      procedure_route: undefined,
      procedure_route_index: undefined,
      procedure_capture_transition: undefined,
      guidance_active_at_ms: undefined,
      star_via_clearance_altitude_ft: undefined,
      scratchpad_auto_direct_token: undefined,
      scratchpad_auto_procedure_token: undefined
    }, dataset, elapsedSeconds, options);
  }

  const distanceToFixNm = distanceNmBetweenPoints(
    aircraftWithApproachProfile.latitude,
    aircraftWithApproachProfile.longitude,
    targetFix.latitude,
    targetFix.longitude
  );
  const sweepDistanceNm = distanceNmForSeconds(
    aircraftWithApproachProfile.ground_speed_kt,
    elapsedSeconds
  );
  const headingTrue = initialBearingTrueDeg(
    aircraftWithApproachProfile.latitude,
    aircraftWithApproachProfile.longitude,
    targetFix.latitude,
    targetFix.longitude
  );
  const targetHeadingTrue = finalSegmentGuidanceHeadingTrue(
    aircraftWithApproachProfile,
    dataset,
    targetFixId
  ) ?? headingTrue;

  if (distanceToFixNm <= Math.max(0.25, sweepDistanceNm)) {
    const sweptAircraft = advanceAircraftWithFlightProfile(
      aircraftWithApproachProfile,
      dataset,
      elapsedSeconds,
      options
    );
    const aircraftAtFix = {
      ...aircraftWithApproachProfile,
      latitude: targetFix.latitude,
      longitude: targetFix.longitude,
      heading_true_deg: sweptAircraft.heading_true_deg,
      ground_speed_kt: sweptAircraft.ground_speed_kt,
      altitude_ft: sweptAircraft.altitude_ft,
      vertical_rate_fpm: sweptAircraft.vertical_rate_fpm,
      procedure_capture_transition: undefined,
      execution_heading_true_deg: targetHeadingTrue
    };

    if (aircraftWithApproachProfile.route_mode === "procedure") {
      const ilsProfile = ilsApproachProfileForAircraft(aircraftWithApproachProfile);

      if (ilsProfile && normalizeFixId(targetFixId) === ilsProfile.thresholdFix) {
        return {
          ...aircraftAtFix,
          heading_true_deg: targetHeadingTrue,
          altitude_ft: ilsProfile.touchdownAltitudeFt,
          vertical_rate_fpm: 0,
          turn_state: undefined,
          route_mode: "vector",
          next_fix: undefined,
          procedure_id: undefined,
          procedure_name: undefined,
          procedure_kind: undefined,
          procedure_route: undefined,
          procedure_route_index: undefined,
          procedure_capture_transition: undefined,
          guidance_active_at_ms: undefined,
          star_via_clearance_altitude_ft: undefined,
          scratchpad_auto_direct_token: undefined,
          scratchpad_auto_procedure_token: undefined,
          approach_phase: "landed",
          landing_state: "landed",
          landed_at_ms: currentTimeMs,
          execution_altitude_ft: ilsProfile.touchdownAltitudeFt,
          execution_vertical_rate_fpm: 0,
          execution_heading_true_deg: targetHeadingTrue
        };
      }

      const route = aircraftWithApproachProfile.procedure_route ?? [];
      const nextRouteIndex = (aircraftWithApproachProfile.procedure_route_index ?? 0) + 1;
      const nextProcedureFixId = route[nextRouteIndex];

      if (nextProcedureFixId) {
        const nextProcedureFix = resolveDirectFix(dataset, nextProcedureFixId);
        const nextHeadingTrue = nextProcedureFix
          ? initialBearingTrueDeg(
              targetFix.latitude,
              targetFix.longitude,
              nextProcedureFix.latitude,
              nextProcedureFix.longitude
            )
          : headingTrue;
        const procedureCaptureTransition = nextProcedureFix
          ? createProcedureCaptureTransition({
              activeFixId: targetFixId,
              nextFixId: nextProcedureFixId,
              currentTimeMs,
              fromHeadingTrueDeg: aircraftAtFix.heading_true_deg,
              targetHeadingTrueDeg: nextHeadingTrue,
              startFix: targetFix
            })
          : undefined;

        return {
          ...aircraftAtFix,
          turn_state: undefined,
          route_mode: "procedure",
          next_fix: nextProcedureFixId,
          procedure_route_index: nextRouteIndex,
          procedure_capture_transition: procedureCaptureTransition,
          approach_phase: approachPhaseForNextFix(
            aircraftWithApproachProfile,
            nextProcedureFixId
          ),
          execution_heading_true_deg: nextHeadingTrue
        };
      }

      return {
        ...aircraftAtFix,
        heading_true_deg: targetHeadingTrue,
        turn_state: undefined,
        ...(isMissedApproachProcedure(aircraftWithApproachProfile)
          ? missedApproachHoldStateAtFix({
              aircraft: aircraftWithApproachProfile,
              aircraftAtFix,
              currentTimeMs,
              headingTrueDeg: targetHeadingTrue,
              targetFixId
            })
          : {
              route_mode: "vector" as const,
              next_fix: undefined,
              procedure_id: undefined,
              procedure_name: undefined,
              procedure_kind: undefined,
              procedure_route: undefined,
              procedure_route_index: undefined,
              approach_phase: undefined
            }),
        procedure_capture_transition: undefined,
        guidance_active_at_ms: undefined,
        star_via_clearance_altitude_ft: undefined,
        scratchpad_auto_direct_token: undefined,
        scratchpad_auto_procedure_token: isMissedApproachProcedure(aircraftWithApproachProfile)
          ? aircraftWithApproachProfile.scratchpad_auto_procedure_token
          : undefined
      };
    }

    return {
      ...aircraftAtFix,
      route_mode: "vector",
      next_fix: undefined,
      procedure_capture_transition: undefined,
      guidance_active_at_ms: undefined,
      scratchpad_auto_direct_token: undefined
    };
  }

  return advanceAircraftWithFlightProfile({
    ...aircraftWithApproachProfile,
    execution_heading_true_deg: targetHeadingTrue
  }, dataset, elapsedSeconds, options);
}

function advanceAircraftInHold(
  aircraft: AircraftState,
  dataset: RadarDataset,
  elapsedSeconds: number,
  options: AircraftMotionOptions
) {
  const currentTimeMs = options.currentTimeMs ?? Date.now();
  const requestedHoldFixId = aircraft.holding_state?.fix_id ?? aircraft.next_fix;
  let pattern =
    holdingPatternForAircraft(aircraft) ??
    (requestedHoldFixId ? holdingPatternForFix(requestedHoldFixId, aircraft) : null);
  let workingAircraft = aircraft;

  if (
    pattern?.anchor_type === "present_position" &&
    typeof pattern.anchor_deferred_until_ms === "number"
  ) {
    if (currentTimeMs < pattern.anchor_deferred_until_ms) {
      return advanceAircraftWithFlightProfile(aircraft, dataset, elapsedSeconds, options);
    }

    pattern = {
      ...pattern,
      anchor_latitude: aircraft.latitude,
      anchor_longitude: aircraft.longitude,
      anchor_deferred_until_ms: undefined,
      notes: [
        ...(pattern.notes ?? []),
        "Present-position anchor fixed after ATC reaction delay."
      ]
    };
    workingAircraft = {
      ...aircraft,
      holding_pattern: pattern,
      holding_state: holdingStateAtFix({
        aircraftHeadingTrueDeg: aircraft.heading_true_deg,
        currentTimeMs,
        pattern
      })
    };
  }

  const holdFixId = pattern?.fix_id ?? requestedHoldFixId;
  const holdFix = pattern ? holdingAnchorForPattern(pattern, dataset, holdFixId) : null;

  if (!holdFixId || !holdFix || !pattern) {
    return advanceAircraftWithFlightProfile(aircraft, dataset, elapsedSeconds, options);
  }

  const distanceToHoldFixNm = distanceNmBetweenPoints(
    workingAircraft.latitude,
    workingAircraft.longitude,
    holdFix.latitude,
    holdFix.longitude
  );
  const sweepDistanceNm = distanceNmForSeconds(workingAircraft.ground_speed_kt, elapsedSeconds);
  const captureDistanceNm = Math.max(HOLDING_FIX_CAPTURE_DISTANCE_NM, sweepDistanceNm);
  let holdingState = normalizedHoldingState({
    aircraft: workingAircraft,
    currentTimeMs,
    distanceToHoldFixNm,
    pattern
  });

  if (holdingState.phase === "entry_to_fix" && distanceToHoldFixNm <= captureDistanceNm) {
    workingAircraft = {
      ...workingAircraft,
      latitude: holdFix.latitude,
      longitude: holdFix.longitude
    };
    holdingState = holdingStateAtFix({
      aircraftHeadingTrueDeg: workingAircraft.heading_true_deg,
      currentTimeMs,
      pattern
    });
  }

  if (holdingState.phase !== "entry_to_fix") {
    holdingState = transitionHoldingStateForTime({
      aircraftHeadingTrueDeg: workingAircraft.heading_true_deg,
      currentTimeMs,
      state: holdingState
    });
  }

  const updatedDistanceToHoldFixNm = distanceNmBetweenPoints(
    workingAircraft.latitude,
    workingAircraft.longitude,
    holdFix.latitude,
    holdFix.longitude
  );
  const updatedHeadingToHoldFix = initialBearingTrueDeg(
    workingAircraft.latitude,
    workingAircraft.longitude,
    holdFix.latitude,
    holdFix.longitude
  );
  const inboundCaptureDistanceNm = Math.max(HOLDING_FIX_CAPTURE_DISTANCE_NM, sweepDistanceNm);

  if (holdingState.phase === "inbound" && updatedDistanceToHoldFixNm <= inboundCaptureDistanceNm) {
    workingAircraft = {
      ...workingAircraft,
      latitude: holdFix.latitude,
      longitude: holdFix.longitude
    };
    holdingState = {
      ...holdingState,
      phase: "outbound",
      phase_started_at_ms: currentTimeMs,
      established_at_ms: holdingState.established_at_ms ?? currentTimeMs
    };
  }

  const targetHeadingTrueDeg = holdingTargetHeading({
    aircraft: workingAircraft,
    headingToHoldFix: updatedHeadingToHoldFix,
    pattern,
    state: holdingState,
    updatedDistanceToHoldFixNm
  });
  const targetAltitudeFt = holdingTargetAltitudeFt(workingAircraft, pattern);
  const targetVerticalRateFpm =
    Math.abs(targetAltitudeFt - workingAircraft.altitude_ft) <= 100
      ? 0
      : workingAircraft.execution_vertical_rate_fpm ?? workingAircraft.assigned?.vertical_rate_fpm ?? 0;
  const targetSpeedKt = holdingTargetSpeedKt(workingAircraft, pattern);
  const holdAircraft: AircraftState = {
    ...workingAircraft,
    route_mode: "hold",
    next_fix: holdFixId,
    holding_pattern: pattern,
    holding_state: holdingState,
    approach_phase: workingAircraft.approach_phase === "landed" ? "missed" : workingAircraft.approach_phase,
    execution_heading_true_deg: targetHeadingTrueDeg,
    execution_speed_kt: targetSpeedKt,
    execution_altitude_ft: targetAltitudeFt,
    execution_vertical_rate_fpm: targetVerticalRateFpm,
    assigned: {
      ...workingAircraft.assigned,
      heading_true_deg: targetHeadingTrueDeg,
      speed_kt: targetSpeedKt,
      altitude_ft: targetAltitudeFt,
      vertical_rate_fpm: targetVerticalRateFpm
    }
  };
  const advancedAircraft = advanceAircraftWithFlightProfile(
    holdAircraft,
    dataset,
    elapsedSeconds,
    options
  );
  const nextHoldingState = transitionHoldingStateForTime({
    aircraftHeadingTrueDeg: advancedAircraft.heading_true_deg,
    currentTimeMs,
    state: holdingState
  });

  return {
    ...advancedAircraft,
    route_mode: "hold" as const,
    next_fix: holdFixId,
    holding_pattern: pattern,
    holding_state: nextHoldingState,
    approach_phase:
      aircraft.approach_phase === "missed" || aircraft.missed_approach_profile_id
        ? "missed" as const
        : aircraft.approach_phase,
    procedure_id: aircraft.procedure_id,
    procedure_name: aircraft.procedure_name,
    procedure_kind: aircraft.procedure_kind,
    procedure_route: aircraft.procedure_route,
    procedure_route_index: aircraft.procedure_route_index,
    scratchpad_auto_procedure_token: aircraft.scratchpad_auto_procedure_token
  };
}

function holdingAnchorForPattern(
  pattern: HoldingPattern,
  dataset: RadarDataset,
  holdFixId: string | undefined
): DirectFixTarget | null {
  if (
    typeof pattern.anchor_latitude === "number" &&
    Number.isFinite(pattern.anchor_latitude) &&
    typeof pattern.anchor_longitude === "number" &&
    Number.isFinite(pattern.anchor_longitude)
  ) {
    return {
      id: pattern.fix_id,
      latitude: pattern.anchor_latitude,
      longitude: pattern.anchor_longitude
    };
  }

  return holdFixId ? resolveDirectFix(dataset, holdFixId) : null;
}

function missedApproachHoldStateAtFix({
  aircraft,
  aircraftAtFix,
  currentTimeMs,
  headingTrueDeg,
  targetFixId
}: {
  aircraft: AircraftState;
  aircraftAtFix: AircraftState;
  currentTimeMs: number;
  headingTrueDeg: number;
  targetFixId: string;
}): Partial<AircraftState> {
  const pattern = holdingPatternForFix(targetFixId, aircraft);
  const targetAltitudeFt = aircraft.execution_altitude_ft ?? aircraft.assigned?.altitude_ft;

  return {
    route_mode: "hold" as const,
    next_fix: targetFixId,
    procedure_route_index: aircraft.procedure_route_index,
    approach_phase: "missed" as const,
    ...(pattern
      ? {
          holding_pattern: pattern,
          holding_state: holdingStateAtFix({
            aircraftHeadingTrueDeg: headingTrueDeg,
            currentTimeMs,
            pattern
          })
        }
      : {}),
    execution_altitude_ft: targetAltitudeFt,
    execution_vertical_rate_fpm:
      typeof targetAltitudeFt === "number" &&
      Math.abs(targetAltitudeFt - aircraftAtFix.altitude_ft) <= 100
        ? 0
        : aircraft.execution_vertical_rate_fpm
  };
}

function normalizedHoldingState({
  aircraft,
  currentTimeMs,
  distanceToHoldFixNm,
  pattern
}: {
  aircraft: AircraftState;
  currentTimeMs: number;
  distanceToHoldFixNm: number;
  pattern: HoldingPattern;
}): AircraftHoldingState {
  const existingState = aircraft.holding_state;

  if (existingState?.pattern_id === pattern.id && existingState.fix_id === pattern.fix_id) {
    return existingState;
  }

  if (distanceToHoldFixNm <= HOLDING_FIX_CAPTURE_DISTANCE_NM) {
    return holdingStateAtFix({
      aircraftHeadingTrueDeg: aircraft.heading_true_deg,
      currentTimeMs,
      pattern
    });
  }

  return {
    pattern_id: pattern.id,
    fix_id: pattern.fix_id,
    entry_type: "direct",
    phase: "entry_to_fix",
    inbound_course_deg: pattern.inbound_course_deg,
    turn_direction: pattern.turn_direction,
    leg_time_min: pattern.leg_time_min,
    phase_started_at_ms: currentTimeMs
  };
}

function transitionHoldingStateForTime({
  aircraftHeadingTrueDeg,
  currentTimeMs,
  state
}: {
  aircraftHeadingTrueDeg: number;
  currentTimeMs: number;
  state: AircraftHoldingState;
}): AircraftHoldingState {
  const timedDurationMs = holdingPhaseDurationMs(state.phase, state.leg_time_min);

  if (timedDurationMs > 0) {
    if (currentTimeMs - state.phase_started_at_ms >= timedDurationMs) {
      return {
        ...state,
        phase: "turn_inbound",
        phase_started_at_ms: currentTimeMs
      };
    }

    return state;
  }

  const nextPhase = nextHoldingTimedPhase(
    state.phase,
    aircraftHeadingTrueDeg,
    state.inbound_course_deg
  );

  if (nextPhase !== state.phase) {
    return {
      ...state,
      phase: nextPhase,
      phase_started_at_ms: currentTimeMs,
      ...(nextPhase === "inbound" ? { established_at_ms: state.established_at_ms ?? currentTimeMs } : {})
    };
  }

  return state;
}

function holdingTargetHeading({
  aircraft,
  headingToHoldFix,
  pattern,
  state,
  updatedDistanceToHoldFixNm
}: {
  aircraft: AircraftState;
  headingToHoldFix: number;
  pattern: HoldingPattern;
  state: AircraftHoldingState;
  updatedDistanceToHoldFixNm: number;
}) {
  if (state.phase === "entry_to_fix") {
    return headingToHoldFix;
  }

  if (
    state.phase === "inbound" ||
    (updatedDistanceToHoldFixNm > HOLDING_FIX_REJOIN_DISTANCE_NM && state.phase === "turn_inbound")
  ) {
    return headingToHoldFix;
  }

  if (state.phase === "entry_teardrop_outbound") {
    return state.entry_target_heading_deg ?? holdingEntryTargetHeading(pattern, state.entry_type);
  }

  if (state.phase === "entry_parallel_outbound") {
    return holdingOutboundHeading(pattern);
  }

  if (state.phase === "turn_inbound") {
    return directionalHoldingTurnTarget(aircraft, pattern, state.inbound_course_deg);
  }

  return holdingOutboundTrackingTarget(aircraft, pattern);
}

function holdingOutboundTrackingTarget(aircraft: AircraftState, pattern: HoldingPattern) {
  const outboundHeading = holdingOutboundHeading(pattern);
  const currentOutboundDelta = Math.abs(shortestHeadingDelta(aircraft.heading_true_deg, outboundHeading));

  return currentOutboundDelta > 25
    ? directionalHoldingTurnTarget(aircraft, pattern, outboundHeading)
    : outboundHeading;
}

function directionalHoldingTurnTarget(
  aircraft: AircraftState,
  pattern: HoldingPattern,
  targetHeadingTrueDeg: number
) {
  const currentHeadingTrueDeg = normalizeHeading(aircraft.heading_true_deg);
  const targetHeading = normalizeHeading(targetHeadingTrueDeg);
  const desiredDirection = pattern.turn_direction === "right" ? 1 : -1;
  const directDelta = shortestHeadingDelta(currentHeadingTrueDeg, targetHeading);

  if (Math.abs(directDelta) > HOLDING_TURN_CAPTURE_HEADING_DEG && Math.sign(directDelta) !== desiredDirection) {
    return normalizeHeading(currentHeadingTrueDeg + desiredDirection * 90);
  }

  const offsetDeg = pattern.turn_direction === "right" ? -1 : 1;

  return normalizeHeading(targetHeading + offsetDeg);
}

function holdingTargetAltitudeFt(aircraft: AircraftState, pattern: HoldingPattern) {
  const assignedAltitudeFt =
    aircraft.execution_altitude_ft ?? aircraft.assigned?.altitude_ft ?? pattern.min_altitude_ft;

  if (typeof assignedAltitudeFt === "number" && Number.isFinite(assignedAltitudeFt)) {
    return assignedAltitudeFt;
  }

  return Math.round(aircraft.altitude_ft);
}

function holdingTargetSpeedKt(aircraft: AircraftState, pattern: HoldingPattern) {
  const currentSpeedKt = currentIndicatedSpeedKt(aircraft);
  const assignedSpeedKt = aircraft.execution_speed_kt ?? aircraft.assigned?.speed_kt ?? currentSpeedKt;

  if (typeof pattern.max_speed_kt === "number" && Number.isFinite(pattern.max_speed_kt)) {
    return Math.min(assignedSpeedKt, pattern.max_speed_kt);
  }

  return assignedSpeedKt;
}

function clearStaleProcedureCaptureTransition(aircraft: AircraftState): AircraftState {
  const transition = aircraft.procedure_capture_transition;

  if (!transition) {
    return aircraft;
  }

  const activeTargetFixId = activeRouteTargetFixId(aircraft);
  const isTransitionStillActive =
    aircraft.route_mode === "procedure" &&
    activeTargetFixId &&
    normalizeFixId(activeTargetFixId) === normalizeFixId(transition.next_fix_id);

  return isTransitionStillActive
    ? aircraft
    : {
        ...aircraft,
        procedure_capture_transition: undefined
      };
}

function isMissedApproachProcedure(aircraft: AircraftState) {
  return normalizeFixId(aircraft.procedure_id ?? "").startsWith(MISSED_APPROACH_PROCEDURE_ID_PREFIX);
}

function createProcedureCaptureTransition(args: {
  activeFixId: string;
  nextFixId: string;
  currentTimeMs: number;
  fromHeadingTrueDeg: number;
  targetHeadingTrueDeg: number;
  startFix: DirectFixTarget;
}): ProcedureCaptureTransitionState {
  return {
    active_fix_id: normalizeFixId(args.activeFixId),
    next_fix_id: normalizeFixId(args.nextFixId),
    started_at_ms: args.currentTimeMs,
    duration_ms: PROCEDURE_CAPTURE_TRANSITION_DURATION_MS,
    elapsed_ms: 0,
    from_heading_true_deg: normalizeHeading(args.fromHeadingTrueDeg),
    target_heading_true_deg: normalizeHeading(args.targetHeadingTrueDeg),
    start_latitude: args.startFix.latitude,
    start_longitude: args.startFix.longitude
  };
}

function advanceProcedureCaptureTransition(
  aircraft: AircraftState,
  dataset: RadarDataset,
  elapsedSeconds: number,
  options: AircraftMotionOptions
): AircraftState | null {
  const transition = aircraft.procedure_capture_transition;

  if (!transition) {
    return null;
  }

  const nextFix = resolveDirectFix(dataset, transition.next_fix_id);

  if (!nextFix) {
    return advanceAircraftWithFlightProfile(
      {
        ...aircraft,
        procedure_capture_transition: undefined
      },
      dataset,
      elapsedSeconds,
      options
    );
  }

  const nextLocal = coordinateToLocalNm(
    nextFix.latitude,
    nextFix.longitude,
    transition.start_latitude,
    transition.start_longitude
  );
  const currentLocal = coordinateToLocalNm(
    aircraft.latitude,
    aircraft.longitude,
    transition.start_latitude,
    transition.start_longitude
  );
  const legLengthNm = Math.hypot(nextLocal.x, nextLocal.y);

  if (legLengthNm <= 0.05) {
    return advanceAircraftWithFlightProfile(
      {
        ...aircraft,
        procedure_capture_transition: undefined
      },
      dataset,
      elapsedSeconds,
      options
    );
  }

  const unitX = nextLocal.x / legLengthNm;
  const unitY = nextLocal.y / legLengthNm;
  const currentAlongNm = clampNumber(
    currentLocal.x * unitX + currentLocal.y * unitY,
    0,
    legLengthNm
  );
  const nextAlongNm = clampNumber(
    currentAlongNm + distanceNmForSeconds(aircraft.ground_speed_kt, elapsedSeconds),
    0,
    legLengthNm
  );
  const nextCoordinate = localNmToCoordinate(
    {
      x: unitX * nextAlongNm,
      y: unitY * nextAlongNm
    },
    transition.start_latitude,
    transition.start_longitude
  );
  const elapsedMs = (transition.elapsed_ms ?? 0) + elapsedSeconds * 1000;
  const progress = clampNumber(elapsedMs / transition.duration_ms, 0, 1);
  const easedProgress = smoothStep(progress);
  const blendedHeadingTrue = interpolateHeadingTrue(
    transition.from_heading_true_deg,
    transition.target_heading_true_deg,
    easedProgress
  );
  const motionAircraft = advanceAircraftWithFlightProfile(
      {
        ...aircraft,
        heading_true_deg: blendedHeadingTrue,
        turn_state: undefined,
        execution_heading_true_deg: blendedHeadingTrue
      },
    dataset,
    elapsedSeconds,
    options
  );
  const transitionDone = progress >= 1 || nextAlongNm >= legLengthNm;

  return {
    ...motionAircraft,
    latitude: nextCoordinate.latitude,
    longitude: nextCoordinate.longitude,
    heading_true_deg: blendedHeadingTrue,
    turn_state: undefined,
    execution_heading_true_deg: transition.target_heading_true_deg,
    procedure_capture_transition: transitionDone
      ? undefined
      : {
          ...transition,
          elapsed_ms: elapsedMs
        }
  };
}

function applyIlsApproachProfile(
  aircraft: AircraftState,
  dataset: RadarDataset,
  currentTimeMs: number
): AircraftState {
  const profile = ilsApproachProfileForAircraft(aircraft);
  const targetFixId = activeRouteTargetFixId(aircraft);

  if (
    !profile ||
    !targetFixId ||
    aircraft.route_mode !== "procedure" ||
    aircraft.procedure_kind !== "APP" ||
    isPending(aircraft.guidance_active_at_ms, currentTimeMs)
  ) {
    return aircraft;
  }

  const normalizedTargetFixId = normalizeFixId(targetFixId);
  const plannerNativeExecution = approachExecutionHandledByGuidancePlanner(aircraft);

  if (normalizedTargetFixId === profile.thresholdFix) {
    const thresholdFix = resolveDirectFix(dataset, profile.thresholdFix);

    if (!thresholdFix) {
      return aircraft;
    }

    const distanceToThresholdNm = distanceNmBetweenPoints(
      aircraft.latitude,
      aircraft.longitude,
      thresholdFix.latitude,
      thresholdFix.longitude
    );
    const targetAltitudeFt = Math.min(
      aircraft.altitude_ft,
      glidePathAltitudeFt(distanceToThresholdNm, profile)
    );
    const requiredDescentFpm = requiredDescentRateFpm(
      aircraft.altitude_ft,
      targetAltitudeFt,
      distanceToThresholdNm,
      aircraft.ground_speed_kt,
      profile
    );
    const executionUpdate: Partial<AircraftState> = plannerNativeExecution
      ? {}
      : {
          execution_speed_kt: speedTargetAtOrBelow(aircraft, profile.finalSpeedKt)
        };

    if (!plannerNativeExecution && approachVerticalProfileEnabled(aircraft)) {
      executionUpdate.execution_altitude_ft = targetAltitudeFt;
      executionUpdate.execution_vertical_rate_fpm = requiredDescentFpm;
    }

    return {
      ...aircraft,
      approach_phase: "final",
      ...executionUpdate
    };
  }

  const crossingAltitudeFt = profile.crossingAltitudesFt[normalizedTargetFixId];

  if (typeof crossingAltitudeFt !== "number") {
    return {
      ...aircraft,
      approach_phase: approachPhaseForNextFix(aircraft, normalizedTargetFixId)
    };
  }

  const executionUpdate: Partial<AircraftState> = plannerNativeExecution
    ? {}
    : {
        execution_speed_kt: speedTargetAtOrBelow(aircraft, profile.finalSpeedKt + 30)
      };
  const crossingFloorFt = approachTransitionCrossingFloorFt(
    aircraft,
    profile,
    normalizedTargetFixId
  );
  const protectedCrossingAltitudeFt =
    typeof crossingFloorFt === "number"
      ? Math.max(crossingAltitudeFt, crossingFloorFt)
      : crossingAltitudeFt;
  const guidancePlan = buildAircraftGuidancePlan(aircraft, dataset, currentTimeMs);
  const currentFixLevelRestrictionCanceled = approachLevelRestrictionCanceled(
    aircraft,
    normalizedTargetFixId
  );
  const assignedAltitudeFt = aircraft.assigned?.altitude_ft;
  const assignedCrossingAltitudeFt =
    currentFixLevelRestrictionCanceled &&
    typeof assignedAltitudeFt === "number" &&
    Number.isFinite(assignedAltitudeFt) &&
    assignedAltitudeFt <= protectedCrossingAltitudeFt + 50
      ? assignedAltitudeFt
      : undefined;
  const plannedCrossingAltitudeFt =
    guidancePlan.vertical.constraint_fix === normalizedTargetFixId &&
    typeof guidancePlan.vertical.target_altitude_ft === "number"
      ? guidancePlan.vertical.target_altitude_ft
      : undefined;
  const effectiveCrossingAltitudeFt =
    plannedCrossingAltitudeFt ??
    assignedCrossingAltitudeFt ??
    (currentFixLevelRestrictionCanceled ? undefined : protectedCrossingAltitudeFt);
  const crossingAltitudeAssignmentArmed = approachCrossingAltitudeAssignmentArmed(
    aircraft,
    protectedCrossingAltitudeFt
  );

  if (
    !plannerNativeExecution &&
    typeof effectiveCrossingAltitudeFt === "number" &&
    (approachVerticalProfileEnabled(aircraft) || crossingAltitudeAssignmentArmed)
  ) {
    if (aircraft.altitude_ft > effectiveCrossingAltitudeFt + 100) {
      executionUpdate.execution_altitude_ft = effectiveCrossingAltitudeFt;
      executionUpdate.execution_vertical_rate_fpm =
        guidancePlan.vertical.target_vertical_rate_fpm ?? -profile.maxDescentFpm;
    } else if (aircraft.altitude_ft < effectiveCrossingAltitudeFt - 100) {
      executionUpdate.execution_altitude_ft = Math.round(aircraft.altitude_ft);
      executionUpdate.execution_vertical_rate_fpm = 0;
    } else {
      executionUpdate.execution_altitude_ft = effectiveCrossingAltitudeFt;
      executionUpdate.execution_vertical_rate_fpm = 0;
    }
  }

  return {
    ...aircraft,
    approach_phase: approachPhaseForNextFix(aircraft, normalizedTargetFixId),
    ...(crossingAltitudeAssignmentArmed ? approachManagedVerticalControlUpdate() : {}),
    ...executionUpdate
  };
}

function approachExecutionHandledByGuidancePlanner(aircraft: AircraftState) {
  return aircraft.route_mode === "procedure" && aircraft.procedure_kind === "APP";
}

function approachVerticalProfileEnabled(aircraft: AircraftState) {
  const procedureMode = aircraft.vertical_procedure_mode ?? "approach";

  return (
    procedureMode === "approach" &&
    aircraft.altitude_control_mode !== "controller" &&
    aircraft.vertical_rate_control_mode !== "controller"
  );
}

function approachCrossingAltitudeAssignmentArmed(
  aircraft: AircraftState,
  crossingAltitudeFt: number
) {
  const assignedAltitudeFt = aircraft.assigned?.altitude_ft;

  return (
    aircraft.route_mode === "procedure" &&
    aircraft.procedure_kind === "APP" &&
    aircraft.altitude_control_mode === "controller" &&
    aircraft.vertical_rate_control_mode !== "controller" &&
    typeof assignedAltitudeFt === "number" &&
    Number.isFinite(assignedAltitudeFt) &&
    assignedAltitudeFt <= crossingAltitudeFt + 50
  );
}

function approachManagedVerticalControlUpdate(): Partial<AircraftState> {
  return {
    altitude_control_mode: "managed",
    vertical_rate_control_mode: "managed",
    vertical_procedure_mode: "approach"
  };
}

function approachTransitionCrossingFloorFt(
  aircraft: AircraftState,
  profile: IlsApproachProfile,
  normalizedTargetFixId: string
) {
  const transition = aircraft.procedure_capture_transition;
  const initialFixId = profile.route[0];

  if (
    !transition ||
    !initialFixId ||
    normalizedTargetFixId !== profile.finalFix ||
    normalizeFixId(transition.active_fix_id) !== initialFixId ||
    normalizeFixId(transition.next_fix_id) !== profile.finalFix
  ) {
    return undefined;
  }

  return profile.crossingAltitudesFt[initialFixId];
}

function glidePathAltitudeFt(distanceToThresholdNm: number, profile: IlsApproachProfile) {
  if (!Number.isFinite(distanceToThresholdNm) || distanceToThresholdNm <= 0) {
    return profile.touchdownAltitudeFt;
  }

  return Math.max(
    profile.touchdownAltitudeFt,
    Math.round(profile.runwayElevationFt + distanceToThresholdNm * 318)
  );
}

function speedTargetAtOrBelow(aircraft: AircraftState, maxSpeedKt: number) {
  const existingTargetSpeedKt = procedureSpeedReferenceKt(aircraft);

  return existingTargetSpeedKt > maxSpeedKt ? maxSpeedKt : existingTargetSpeedKt;
}

function procedureSpeedReferenceKt(aircraft: AircraftState) {
  if (typeof aircraft.execution_speed_kt === "number" && Number.isFinite(aircraft.execution_speed_kt)) {
    return aircraft.execution_speed_kt;
  }

  if (
    aircraft.speed_control_mode === "controller" &&
    aircraft.controller_speed_policy?.type === "target" &&
    typeof aircraft.controller_speed_policy.speed_kt === "number" &&
    Number.isFinite(aircraft.controller_speed_policy.speed_kt)
  ) {
    return aircraft.controller_speed_policy.speed_kt;
  }

  if (
    aircraft.speed_control_mode === "controller" &&
    !aircraft.controller_speed_policy &&
    typeof aircraft.controller_assigned_speed_kt === "number" &&
    Number.isFinite(aircraft.controller_assigned_speed_kt)
  ) {
    return aircraft.controller_assigned_speed_kt;
  }

  if (
    aircraft.speed_control_mode !== "released" &&
    !aircraft.controller_speed_policy &&
    typeof aircraft.speed_active_at_ms === "number" &&
    Number.isFinite(aircraft.speed_active_at_ms) &&
    typeof aircraft.assigned?.speed_kt === "number" &&
    Number.isFinite(aircraft.assigned.speed_kt)
  ) {
    return aircraft.assigned.speed_kt;
  }

  return currentIndicatedSpeedKt(aircraft);
}

function ilsApproachProfileForAircraft(aircraft: AircraftState) {
  const procedureId = normalizeFixId(aircraft.procedure_id ?? "");
  const route = aircraft.procedure_route?.map(normalizeFixId) ?? [];

  return ILS_APPROACH_PROFILES.find(
    (profile) =>
      procedureId.includes(profile.procedureId) ||
      (route.includes(profile.finalFix) && route.includes(profile.thresholdFix))
  );
}

function finalSegmentGuidanceHeadingTrue(
  aircraft: AircraftState,
  dataset: RadarDataset,
  targetFixId: string
) {
  const profile = ilsApproachProfileForAircraft(aircraft);

  if (
    !profile ||
    aircraft.route_mode !== "procedure" ||
    aircraft.procedure_kind !== "APP" ||
    normalizeFixId(targetFixId) !== profile.thresholdFix
  ) {
    return null;
  }

  return localizerGuidanceHeadingTrue(aircraft, dataset, profile);
}

function localizerGuidanceHeadingTrue(
  aircraft: AircraftState,
  dataset: RadarDataset,
  profile: IlsApproachProfile
) {
  const geometry = localizerGeometryForAircraft(aircraft, dataset, profile);

  if (!geometry || geometry.courseLengthNm <= 0.2) {
    return null;
  }

  const distanceToThresholdNm = distanceNmBetweenPoints(
    aircraft.latitude,
    aircraft.longitude,
    geometry.thresholdFix.latitude,
    geometry.thresholdFix.longitude
  );

  if (distanceToThresholdNm <= 0.8) {
    return initialBearingTrueDeg(
      aircraft.latitude,
      aircraft.longitude,
      geometry.thresholdFix.latitude,
      geometry.thresholdFix.longitude
    );
  }

  const leadNm = clampNumber(
    distanceNmForSeconds(aircraft.ground_speed_kt, LOCALIZER_LEAD_SECONDS),
    profile.localizerLeadMinNm,
    profile.localizerLeadMaxNm
  );
  const targetAlongNm = clampNumber(
    geometry.alongNm + leadNm,
    0.15,
    Math.max(0.2, geometry.courseLengthNm - 0.15)
  );
  const targetLocal = {
    x: geometry.unitX * targetAlongNm,
    y: geometry.unitY * targetAlongNm
  };
  const targetCoordinate = localNmToCoordinate(
    targetLocal,
    geometry.finalFix.latitude,
    geometry.finalFix.longitude
  );

  return initialBearingTrueDeg(
    aircraft.latitude,
    aircraft.longitude,
    targetCoordinate.latitude,
    targetCoordinate.longitude
  );
}

function localizerGeometryForAircraft(
  aircraft: AircraftState,
  dataset: RadarDataset,
  profile: IlsApproachProfile
): LocalizerGeometry | null {
  const finalFix = resolveDirectFix(dataset, profile.finalFix);
  const thresholdFix = resolveDirectFix(dataset, profile.thresholdFix);

  if (!finalFix || !thresholdFix) {
    return null;
  }

  const thresholdLocal = coordinateToLocalNm(
    thresholdFix.latitude,
    thresholdFix.longitude,
    finalFix.latitude,
    finalFix.longitude
  );
  const currentLocal = coordinateToLocalNm(
    aircraft.latitude,
    aircraft.longitude,
    finalFix.latitude,
    finalFix.longitude
  );
  const courseLengthNm = Math.hypot(thresholdLocal.x, thresholdLocal.y);

  if (courseLengthNm <= 0.05) {
    return null;
  }

  const unitX = thresholdLocal.x / courseLengthNm;
  const unitY = thresholdLocal.y / courseLengthNm;
  const alongNm = currentLocal.x * unitX + currentLocal.y * unitY;
  const lateralNm = currentLocal.x * -unitY + currentLocal.y * unitX;

  return {
    profile,
    finalFix,
    thresholdFix,
    courseTrueDeg: initialBearingTrueDeg(
      finalFix.latitude,
      finalFix.longitude,
      thresholdFix.latitude,
      thresholdFix.longitude
    ),
    courseLengthNm,
    alongNm,
    lateralNm,
    unitX,
    unitY
  };
}

function approachPhaseForNextFix(aircraft: AircraftState, nextFixId: string) {
  const profile = ilsApproachProfileForAircraft(aircraft);
  const normalizedNextFixId = normalizeFixId(nextFixId);

  if (!profile) {
    return aircraft.approach_phase;
  }

  if (normalizedNextFixId === profile.thresholdFix) {
    return "final";
  }

  if (normalizedNextFixId === profile.finalFix) {
    return "intermediate";
  }

  return "initial";
}

function requiredDescentRateFpm(
  currentAltitudeFt: number,
  targetAltitudeFt: number,
  distanceToThresholdNm: number,
  groundSpeedKt: number,
  profile: IlsApproachProfile
) {
  if (
    !Number.isFinite(distanceToThresholdNm) ||
    distanceToThresholdNm <= 0.1 ||
    !Number.isFinite(groundSpeedKt) ||
    groundSpeedKt <= 0
  ) {
    return -profile.minDescentFpm;
  }

  const altitudeToLoseFt = Math.max(0, currentAltitudeFt - targetAltitudeFt);
  const minutesToThreshold = distanceToThresholdNm / (groundSpeedKt / 60);
  const rawRateFpm = minutesToThreshold > 0 ? altitudeToLoseFt / minutesToThreshold : profile.maxDescentFpm;
  const clampedRateFpm = Math.min(
    profile.maxDescentFpm,
    Math.max(profile.minDescentFpm, rawRateFpm)
  );

  return -clampedRateFpm;
}

function isPending(activeAtMs: number | undefined, currentTimeMs: number) {
  return typeof activeAtMs === "number" && currentTimeMs < activeAtMs;
}

function coordinateToLocalNm(
  latitude: number,
  longitude: number,
  originLatitude: number,
  originLongitude: number
) {
  const longitudeScale = Math.cos(toRadians(originLatitude));

  return {
    x: (longitude - originLongitude) * 60 * longitudeScale,
    y: (latitude - originLatitude) * 60
  };
}

function localNmToCoordinate(
  point: { x: number; y: number },
  originLatitude: number,
  originLongitude: number
) {
  const longitudeScale = Math.cos(toRadians(originLatitude));

  return {
    latitude: originLatitude + point.y / 60,
    longitude: originLongitude + point.x / (60 * longitudeScale)
  };
}

function normalizeHeading(headingTrueDeg: number) {
  return ((headingTrueDeg % 360) + 360) % 360;
}

function interpolateHeadingTrue(fromHeadingTrueDeg: number, targetHeadingTrueDeg: number, ratio: number) {
  const delta = ((((targetHeadingTrueDeg - fromHeadingTrueDeg + 540) % 360) + 360) % 360) - 180;

  return normalizeHeading(fromHeadingTrueDeg + delta * clampNumber(ratio, 0, 1));
}

function smoothStep(ratio: number) {
  const clampedRatio = clampNumber(ratio, 0, 1);

  return clampedRatio * clampedRatio * (3 - 2 * clampedRatio);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}
