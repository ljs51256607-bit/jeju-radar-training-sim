import {
  resolveWindAtAltitude,
  windCorrectedMotionForHeading,
  windCorrectionHeadingForTrack
} from "./windModel";
import type {
  AircraftPerformanceProfile,
  AircraftOneCircleTurnState,
  AircraftState,
  AircraftTurnState,
  WindSettings
} from "./types";

const EARTH_RADIUS_NM = 3440.065;
const DESCENT_SPEED_GATE_ALTITUDE_FT = 10000;
const DESCENT_SPEED_GATE_MAX_SPEED_KT = 250;
const DESCENT_SPEED_GATE_RELEASE_MARGIN_KT = 1;
const DEFAULT_CLIMB_ACCEL_VERTICAL_PENALTY_FPM_PER_KT_SEC = 1200;
const DEFAULT_EXPEDITE_DESCENT_RATE_FACTOR = 1.3;
const DEFAULT_EXPEDITE_DESCENT_SPEED_BIAS_KT = 20;
const DEFAULT_EXPEDITE_DESCENT_MAX_SPEED_KT = 300;
const DEFAULT_EXPEDITE_CLIMB_RATE_FACTOR = 1.2;
const DEFAULT_INCREASE_RATE_STEP_FPM = 500;
const DEFAULT_PERFORMANCE_PROFILE: AircraftPerformanceProfile = {
  id: "fallback_narrowbody",
  aircraft_types: [],
  normal_bank_deg: 25,
  max_bank_deg: 30,
  max_turn_rate_deg_sec: 3,
  roll_rate_deg_sec: 5,
  rollout_heading_delta_deg: 3,
  accel_kt_sec: 1.3,
  decel_kt_sec: 2,
  climb_accel_factor: 0.7,
  high_altitude_accel_factor: 0.65,
  approach_decel_factor: 1.2,
  tas_factor_per_1000_ft: 0.012,
  max_tas_factor: 1.3,
  high_altitude_threshold_ft: 14000,
  climb_fpm: 1800,
  descent_fpm: 1500,
  climb_acceleration_vertical_penalty_fpm_per_kt_sec: DEFAULT_CLIMB_ACCEL_VERTICAL_PENALTY_FPM_PER_KT_SEC,
  expedite_descent_rate_factor: DEFAULT_EXPEDITE_DESCENT_RATE_FACTOR,
  expedite_descent_speed_bias_kt: DEFAULT_EXPEDITE_DESCENT_SPEED_BIAS_KT,
  expedite_descent_max_speed_kt: DEFAULT_EXPEDITE_DESCENT_MAX_SPEED_KT,
  expedite_climb_rate_factor: DEFAULT_EXPEDITE_CLIMB_RATE_FACTOR,
  increase_rate_step_fpm: DEFAULT_INCREASE_RATE_STEP_FPM,
  deceleration_descent_min_fpm: 500,
  deceleration_descent_buffer_sec: 10,
  vertical_rate_change_fpm_sec: 300,
  altitude_capture_ft: 100,
  altitude_capture_taper_ft: 900,
  minimum_capture_vertical_rate_fpm: 300
};

export interface AircraftMotionOptions {
  currentTimeMs?: number;
  performance?: AircraftPerformanceProfile;
  wind?: WindSettings;
}

interface MotionSpeedConstraint {
  target_speed_kt: number;
  target_altitude_ft: number;
  altitude_delta_to_target_ft: number;
}

export function destinationPoint(
  latitude: number,
  longitude: number,
  headingTrueDeg: number,
  distanceNm: number
) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !Number.isFinite(headingTrueDeg)) {
    return { latitude, longitude };
  }

  if (!Number.isFinite(distanceNm) || distanceNm === 0) {
    return { latitude, longitude };
  }

  const angularDistance = distanceNm / EARTH_RADIUS_NM;
  const bearing = toRadians(normalizeHeading(headingTrueDeg));
  const lat1 = toRadians(latitude);
  const lon1 = toRadians(longitude);
  const sinLat1 = Math.sin(lat1);
  const cosLat1 = Math.cos(lat1);
  const sinAngularDistance = Math.sin(angularDistance);
  const cosAngularDistance = Math.cos(angularDistance);

  const lat2 = Math.asin(
    sinLat1 * cosAngularDistance + cosLat1 * sinAngularDistance * Math.cos(bearing)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearing) * sinAngularDistance * cosLat1,
      cosAngularDistance - sinLat1 * Math.sin(lat2)
    );

  return {
    latitude: toDegrees(lat2),
    longitude: normalizeLongitude(toDegrees(lon2))
  };
}

export function distanceNmForSeconds(groundSpeedKt: number, seconds: number) {
  if (!Number.isFinite(groundSpeedKt) || !Number.isFinite(seconds) || groundSpeedKt <= 0 || seconds <= 0) {
    return 0;
  }

  return groundSpeedKt * (seconds / 3600);
}

export function groundSpeedFromIndicatedSpeed(
  indicatedSpeedKt: number,
  altitudeFt: number,
  performance: AircraftPerformanceProfile = DEFAULT_PERFORMANCE_PROFILE
) {
  if (!Number.isFinite(indicatedSpeedKt) || indicatedSpeedKt <= 0) {
    return 0;
  }

  return indicatedSpeedKt * trueAirspeedFactorForAltitude(altitudeFt, performance);
}

export function distanceNmBetweenPoints(
  startLatitude: number,
  startLongitude: number,
  endLatitude: number,
  endLongitude: number
) {
  if (
    !Number.isFinite(startLatitude) ||
    !Number.isFinite(startLongitude) ||
    !Number.isFinite(endLatitude) ||
    !Number.isFinite(endLongitude)
  ) {
    return 0;
  }

  const startLat = toRadians(startLatitude);
  const endLat = toRadians(endLatitude);
  const deltaLat = toRadians(endLatitude - startLatitude);
  const deltaLon = toRadians(endLongitude - startLongitude);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(startLat) * Math.cos(endLat) * Math.sin(deltaLon / 2) ** 2;

  return 2 * EARTH_RADIUS_NM * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function initialBearingTrueDeg(
  startLatitude: number,
  startLongitude: number,
  endLatitude: number,
  endLongitude: number
) {
  if (
    !Number.isFinite(startLatitude) ||
    !Number.isFinite(startLongitude) ||
    !Number.isFinite(endLatitude) ||
    !Number.isFinite(endLongitude)
  ) {
    return 0;
  }

  const startLat = toRadians(startLatitude);
  const endLat = toRadians(endLatitude);
  const deltaLon = toRadians(endLongitude - startLongitude);
  const y = Math.sin(deltaLon) * Math.cos(endLat);
  const x =
    Math.cos(startLat) * Math.sin(endLat) -
    Math.sin(startLat) * Math.cos(endLat) * Math.cos(deltaLon);

  return normalizeHeading(toDegrees(Math.atan2(y, x)));
}

export function advanceAircraftForRadarSweep(
  aircraft: AircraftState,
  elapsedSeconds: number,
  options: AircraftMotionOptions = {}
): AircraftState {
  const performance = options.performance ?? DEFAULT_PERFORMANCE_PROFILE;
  const currentTimeMs = options.currentTimeMs ?? Date.now();
  const motionSpeedConstraint = descentSpeedGateLookahead(aircraft, currentTimeMs, performance);
  const altitudeState = nextAltitudeState(
    aircraft,
    elapsedSeconds,
    currentTimeMs,
    performance,
    motionSpeedConstraint
  );
  const speedState = nextSpeedState(
    aircraft,
    elapsedSeconds,
    currentTimeMs,
    performance,
    altitudeState.altitude_ft,
    altitudeState.vertical_rate_fpm,
    motionSpeedConstraint
  );
  const wind = resolveWindAtAltitude(options.wind, altitudeState.altitude_ft);
  const trueAirspeedKt = speedState.ground_speed_kt;
  const desiredTrackHeading =
    wind.speed_kt > 0 && aircraftTracksRoute(aircraft)
      ? executionHeadingTrueDeg(aircraft)
      : undefined;
  const windCorrectedAssignedHeading =
    typeof desiredTrackHeading === "number" && Number.isFinite(desiredTrackHeading)
      ? windCorrectionHeadingForTrack(desiredTrackHeading, trueAirspeedKt, wind)
      : undefined;
  const headingState = nextHeadingState(
    aircraft,
    elapsedSeconds,
    currentTimeMs,
    performance,
    trueAirspeedKt,
    windCorrectedAssignedHeading
  );
  const windMotion = windCorrectedMotionForHeading({
    headingTrueDeg: headingState.heading_true_deg,
    trueAirspeedKt,
    wind,
    holdTrack: false
  });
  const distanceNm = distanceNmForSeconds(windMotion.ground_speed_kt, elapsedSeconds);
  const nextPosition = destinationPoint(
    aircraft.latitude,
    aircraft.longitude,
    windMotion.track_true_deg,
    distanceNm
  );

  return {
    ...aircraft,
    heading_true_deg: windMotion.heading_true_deg,
    indicated_speed_kt: speedState.indicated_speed_kt,
    ground_speed_kt: windMotion.ground_speed_kt,
    latitude: nextPosition.latitude,
    longitude: nextPosition.longitude,
    altitude_ft: altitudeState.altitude_ft,
    vertical_rate_fpm: altitudeState.vertical_rate_fpm,
    turn_state: headingState.turn_state,
    one_circle_turn_state: headingState.one_circle_turn_state
  };
}

function nextHeadingState(
  aircraft: AircraftState,
  elapsedSeconds: number,
  currentTimeMs: number,
  performance: AircraftPerformanceProfile,
  turnSpeedKt: number,
  assignedHeadingOverride?: number
) {
  const assignedHeading = typeof assignedHeadingOverride === "number"
    ? assignedHeadingOverride
    : executionHeadingTrueDeg(aircraft);

  if (aircraft.one_circle_turn_state) {
    if (isPending(aircraft.heading_active_at_ms, currentTimeMs)) {
      return {
        heading_true_deg: normalizeHeading(aircraft.heading_true_deg),
        turn_state: undefined,
        one_circle_turn_state: aircraft.one_circle_turn_state
      };
    }

    return nextOneCircleHeadingState(
      aircraft,
      elapsedSeconds,
      performance,
      turnSpeedKt
    );
  }

  if (
    typeof assignedHeading !== "number" ||
    !Number.isFinite(assignedHeading) ||
    isPending(aircraft.heading_active_at_ms, currentTimeMs)
  ) {
    return {
      heading_true_deg: normalizeHeading(aircraft.heading_true_deg),
      turn_state: undefined,
      one_circle_turn_state: undefined
    };
  }

  const currentHeading = normalizeHeading(aircraft.heading_true_deg);
  const targetHeading = normalizeHeading(assignedHeading);
  const headingDelta = shortestHeadingDelta(currentHeading, targetHeading);
  const absHeadingDelta = Math.abs(headingDelta);
  const captureDelta = Math.max(0.5, performance.rollout_heading_delta_deg ?? 3);

  if (absHeadingDelta <= 0.2) {
    return {
      heading_true_deg: targetHeading,
      turn_state: undefined,
      one_circle_turn_state: undefined
    };
  }

  const previousTurnState = aircraft.turn_state;
  const previousDirection = previousTurnState?.direction ?? 0;
  const commandedDirection = turnDirection(headingDelta);
  const previousBankAbs = Math.abs(previousTurnState?.bank_deg ?? 0);
  const rollRateDegSec = Math.max(0.1, performance.roll_rate_deg_sec ?? 5);
  const normalBankDeg = clampNumber(
    performance.normal_bank_deg,
    0,
    Math.max(0, performance.max_bank_deg)
  );
  const bankStepDeg = rollRateDegSec * elapsedSeconds;
  const currentTurnRateDegSec = turnRateDegSecForBank(performance, turnSpeedKt, previousBankAbs);
  const rolloutLeadDeg = Math.max(
    captureDelta,
    currentTurnRateDegSec * (previousBankAbs / rollRateDegSec) * 0.5
  );
  const reversing =
    previousDirection !== 0 &&
    commandedDirection !== 0 &&
    previousDirection !== commandedDirection &&
    previousBankAbs > 0.5;
  const shouldRollOut = !reversing && previousBankAbs > 0.5 && absHeadingDelta <= rolloutLeadDeg;
  const targetBankAbs = reversing || shouldRollOut ? 0 : normalBankDeg;
  const nextBankAbs = approachNumber(previousBankAbs, targetBankAbs, bankStepDeg);
  const effectiveDirection = reversing ? previousDirection : commandedDirection;
  const turnRateDegSec = turnRateDegSecForBank(performance, turnSpeedKt, nextBankAbs);
  const maxHeadingStep = Math.max(0, turnRateDegSec * elapsedSeconds);

  if (maxHeadingStep <= 0.001) {
    return {
      heading_true_deg: currentHeading,
      turn_state: buildTurnState(targetHeading, nextBankAbs, effectiveDirection),
      one_circle_turn_state: undefined
    };
  }

  if (absHeadingDelta <= maxHeadingStep) {
    return {
      heading_true_deg: targetHeading,
      turn_state: undefined,
      one_circle_turn_state: undefined
    };
  }

  const nextHeading = normalizeHeading(currentHeading + effectiveDirection * maxHeadingStep);
  const nextDelta = Math.abs(shortestHeadingDelta(nextHeading, targetHeading));

  if (nextBankAbs <= 0.5 && nextDelta <= captureDelta) {
    return {
      heading_true_deg: targetHeading,
      turn_state: undefined,
      one_circle_turn_state: undefined
    };
  }

  return {
    heading_true_deg: nextHeading,
    turn_state: buildTurnState(targetHeading, nextBankAbs, effectiveDirection),
    one_circle_turn_state: undefined
  };
}

function nextOneCircleHeadingState(
  aircraft: AircraftState,
  elapsedSeconds: number,
  performance: AircraftPerformanceProfile,
  turnSpeedKt: number
) {
  const oneCircle = aircraft.one_circle_turn_state as AircraftOneCircleTurnState;
  const currentHeading = normalizeHeading(aircraft.heading_true_deg);
  const targetHeading = normalizeHeading(oneCircle.target_heading_true_deg);
  const direction = oneCircle.direction;
  const previousBankAbs = Math.abs(aircraft.turn_state?.bank_deg ?? 0);
  const rollRateDegSec = Math.max(0.1, performance.roll_rate_deg_sec ?? 5);
  const normalBankDeg = clampNumber(
    performance.normal_bank_deg,
    0,
    Math.max(0, performance.max_bank_deg)
  );
  const bankStepDeg = rollRateDegSec * elapsedSeconds;
  const currentTurnRateDegSec = turnRateDegSecForBank(performance, turnSpeedKt, previousBankAbs);
  const captureDelta = Math.max(0.5, performance.rollout_heading_delta_deg ?? 3);
  const rolloutLeadDeg = Math.max(
    captureDelta,
    currentTurnRateDegSec * (previousBankAbs / rollRateDegSec) * 0.5
  );
  const remainingTurnDeg = Math.max(0, oneCircle.required_turn_deg - oneCircle.accumulated_turn_deg);
  const shouldRollOut = previousBankAbs > 0.5 && remainingTurnDeg <= rolloutLeadDeg;
  const targetBankAbs = shouldRollOut ? 0 : normalBankDeg;
  const nextBankAbs = approachNumber(previousBankAbs, targetBankAbs, bankStepDeg);
  const turnRateDegSec = turnRateDegSecForBank(performance, turnSpeedKt, nextBankAbs);
  const maxHeadingStep = Math.max(0, turnRateDegSec * elapsedSeconds);

  if (remainingTurnDeg <= Math.max(0.2, maxHeadingStep)) {
    return {
      heading_true_deg: targetHeading,
      turn_state: undefined,
      one_circle_turn_state: undefined
    };
  }

  if (maxHeadingStep <= 0.001) {
    return {
      heading_true_deg: currentHeading,
      turn_state: buildTurnState(targetHeading, nextBankAbs, direction),
      one_circle_turn_state: oneCircle
    };
  }

  const turnStepDeg = Math.min(maxHeadingStep, remainingTurnDeg);
  const nextHeading = normalizeHeading(currentHeading + direction * turnStepDeg);
  const nextAccumulatedTurnDeg = oneCircle.accumulated_turn_deg + turnStepDeg;
  const nextRemainingTurnDeg = Math.max(0, oneCircle.required_turn_deg - nextAccumulatedTurnDeg);

  if (nextRemainingTurnDeg <= captureDelta && nextBankAbs <= 0.5) {
    return {
      heading_true_deg: targetHeading,
      turn_state: undefined,
      one_circle_turn_state: undefined
    };
  }

  return {
    heading_true_deg: nextHeading,
    turn_state: buildTurnState(targetHeading, nextBankAbs, direction),
    one_circle_turn_state: {
      ...oneCircle,
      last_heading_true_deg: nextHeading,
      accumulated_turn_deg: nextAccumulatedTurnDeg
    }
  };
}

function aircraftTracksRoute(aircraft: AircraftState) {
  return aircraft.route_mode === "direct" || aircraft.route_mode === "procedure";
}

function nextSpeedState(
  aircraft: AircraftState,
  elapsedSeconds: number,
  currentTimeMs: number,
  performance: AircraftPerformanceProfile,
  altitudeFt: number,
  verticalRateFpm: number,
  motionSpeedConstraint?: MotionSpeedConstraint
) {
  const assignedSpeed = executionSpeedKt(aircraft);
  const currentIndicatedSpeedKt = indicatedSpeedFromAircraft(aircraft);
  let indicatedSpeedKt = currentIndicatedSpeedKt;
  const assignedSpeedIsActive =
    typeof assignedSpeed === "number" &&
    Number.isFinite(assignedSpeed) &&
    !isPending(aircraft.speed_active_at_ms, currentTimeMs);
  const effectiveSpeedTarget =
    typeof motionSpeedConstraint?.target_speed_kt === "number"
      ? assignedSpeedIsActive
        ? Math.min(assignedSpeed as number, motionSpeedConstraint.target_speed_kt)
        : motionSpeedConstraint.target_speed_kt
      : assignedSpeedIsActive
        ? assignedSpeed
        : expediteDescentSpeedTargetKt(
            aircraft,
            altitudeFt,
            verticalRateFpm,
            performance,
            motionSpeedConstraint
          );

  if (typeof effectiveSpeedTarget === "number" && Number.isFinite(effectiveSpeedTarget)) {
    const speedDelta = effectiveSpeedTarget - currentIndicatedSpeedKt;
    const rateKtSec = speedRateKtSec(aircraft, speedDelta, altitudeFt, verticalRateFpm, performance);
    indicatedSpeedKt = approachNumber(
      currentIndicatedSpeedKt,
      effectiveSpeedTarget,
      Math.max(0, rateKtSec * elapsedSeconds)
    );
  }

  return {
    indicated_speed_kt: Math.max(0, indicatedSpeedKt),
    ground_speed_kt: groundSpeedFromIndicatedSpeed(indicatedSpeedKt, altitudeFt, performance)
  };
}

function nextAltitudeState(
  aircraft: AircraftState,
  elapsedSeconds: number,
  currentTimeMs: number,
  performance: AircraftPerformanceProfile,
  motionSpeedConstraint?: MotionSpeedConstraint
) {
  const assignedAltitude = executionAltitudeFt(aircraft);
  const assignedVerticalRate = executionVerticalRateFpm(aircraft);
  const altitudeIsActive = !isPending(aircraft.altitude_active_at_ms, currentTimeMs);
  const verticalRateIsActive = !isPending(aircraft.vertical_rate_active_at_ms, currentTimeMs);
  let verticalRateFpm = Number.isFinite(aircraft.vertical_rate_fpm) ? aircraft.vertical_rate_fpm : 0;

  if (typeof assignedAltitude === "number" && Number.isFinite(assignedAltitude) && altitudeIsActive) {
    const altitudeDelta = assignedAltitude - aircraft.altitude_ft;

    if (Math.abs(altitudeDelta) <= performance.altitude_capture_ft) {
      if (speedGateRequiresHold(aircraft, motionSpeedConstraint)) {
        return {
          altitude_ft: aircraft.altitude_ft,
          vertical_rate_fpm: 0
        };
      }

      return {
        altitude_ft: assignedAltitude,
        vertical_rate_fpm: 0
      };
    }

    const targetDirection = Math.sign(altitudeDelta);
    const assignedVerticalRateUsable =
      typeof assignedVerticalRate === "number" &&
      Number.isFinite(assignedVerticalRate) &&
      verticalRateIsActive &&
      assignedVerticalRate !== 0 &&
      Math.sign(assignedVerticalRate) === targetDirection;
    const rawBaseVerticalRateFpm = assignedVerticalRateUsable
      ? Math.abs(assignedVerticalRate)
      : altitudeDelta > 0
        ? performance.climb_fpm
        : performance.descent_fpm;
    const baseVerticalRateFpm = !assignedVerticalRateUsable
      ? energyAdjustedBaseVerticalRateAbsFpm(
          aircraft,
          targetDirection,
          rawBaseVerticalRateFpm,
          performance
        )
      : rawBaseVerticalRateFpm;
    let targetVerticalRateAbsFpm = altitudeCaptureVerticalRate(
      baseVerticalRateFpm,
      Math.abs(altitudeDelta),
      performance
    );

    if (targetDirection < 0) {
      targetVerticalRateAbsFpm = descentRateWithSpeedPlanning(
        aircraft,
        targetVerticalRateAbsFpm,
        Math.abs(altitudeDelta),
        currentTimeMs,
        performance,
        motionSpeedConstraint
      );
    } else if (targetDirection > 0) {
      targetVerticalRateAbsFpm = climbRateWithSpeedPlanning(
        aircraft,
        targetVerticalRateAbsFpm,
        currentTimeMs,
        performance
      );
    }

    verticalRateFpm = smoothVerticalRate(
      verticalRateFpm,
      targetDirection * targetVerticalRateAbsFpm,
      elapsedSeconds,
      performance
    );
  } else if (
    typeof assignedVerticalRate === "number" &&
    Number.isFinite(assignedVerticalRate) &&
    verticalRateIsActive
  ) {
    const targetVerticalRateFpm =
      assignedVerticalRate < 0 && motionSpeedConstraint
        ? -limitDescentRateForSpeedTarget(
            aircraft,
            Math.abs(assignedVerticalRate),
            motionSpeedConstraint.altitude_delta_to_target_ft,
            motionSpeedConstraint.target_speed_kt,
            performance
          )
        : assignedVerticalRate;

    verticalRateFpm = smoothVerticalRate(
      verticalRateFpm,
      targetVerticalRateFpm,
      elapsedSeconds,
      performance
    );
  } else if (verticalRateFpm < 0 && motionSpeedConstraint) {
    verticalRateFpm = smoothVerticalRate(
      verticalRateFpm,
      -limitDescentRateForSpeedTarget(
        aircraft,
        Math.abs(verticalRateFpm),
        motionSpeedConstraint.altitude_delta_to_target_ft,
        motionSpeedConstraint.target_speed_kt,
        performance
      ),
      elapsedSeconds,
      performance
    );
  }

  if (!Number.isFinite(verticalRateFpm) || verticalRateFpm === 0) {
    return {
      altitude_ft: aircraft.altitude_ft,
      vertical_rate_fpm: 0
    };
  }

  const rawAltitude = aircraft.altitude_ft + verticalRateFpm * (elapsedSeconds / 60);
  const speedGateBoundaryState = pendingSpeedGateBoundaryState(
    aircraft,
    rawAltitude,
    verticalRateFpm,
    motionSpeedConstraint
  );

  if (speedGateBoundaryState) {
    return speedGateBoundaryState;
  }

  if (typeof assignedAltitude !== "number" || !Number.isFinite(assignedAltitude)) {
    return {
      altitude_ft: rawAltitude,
      vertical_rate_fpm: verticalRateFpm
    };
  }

  if (!altitudeIsActive) {
    const protectedAltitudeState = pendingAltitudeBoundaryState(
      aircraft.altitude_ft,
      rawAltitude,
      verticalRateFpm,
      assignedAltitude,
      performance
    );

    if (protectedAltitudeState) {
      return protectedAltitudeState;
    }

    return {
      altitude_ft: rawAltitude,
      vertical_rate_fpm: verticalRateFpm
    };
  }

  if (
    Math.abs(rawAltitude - assignedAltitude) <= performance.altitude_capture_ft ||
    (verticalRateFpm > 0 && rawAltitude >= assignedAltitude) ||
    (verticalRateFpm < 0 && rawAltitude <= assignedAltitude)
  ) {
    return {
      altitude_ft: assignedAltitude,
      vertical_rate_fpm: 0
    };
  }

  return {
    altitude_ft: rawAltitude,
    vertical_rate_fpm: verticalRateFpm
  };
}

function pendingAltitudeBoundaryState(
  currentAltitudeFt: number,
  rawAltitudeFt: number,
  verticalRateFpm: number,
  assignedAltitudeFt: number,
  performance: AircraftPerformanceProfile
) {
  const currentDeltaFt = currentAltitudeFt - assignedAltitudeFt;
  const rawDeltaFt = rawAltitudeFt - assignedAltitudeFt;
  const crossedAssignedAltitude =
    currentDeltaFt === 0 ||
    rawDeltaFt === 0 ||
    Math.sign(currentDeltaFt) !== Math.sign(rawDeltaFt);

  if (
    crossedAssignedAltitude ||
    Math.abs(rawDeltaFt) <= performance.altitude_capture_ft
  ) {
    return {
      altitude_ft: assignedAltitudeFt,
      vertical_rate_fpm: 0
    };
  }

  const movingAwayFromAssignedAltitude =
    Math.abs(rawDeltaFt) > Math.abs(currentDeltaFt) &&
    Math.sign(verticalRateFpm) === Math.sign(currentDeltaFt);

  if (movingAwayFromAssignedAltitude) {
    return {
      altitude_ft: currentAltitudeFt,
      vertical_rate_fpm: 0
    };
  }

  return null;
}

function executionHeadingTrueDeg(aircraft: AircraftState) {
  return typeof aircraft.execution_heading_true_deg === "number" &&
    Number.isFinite(aircraft.execution_heading_true_deg)
    ? aircraft.execution_heading_true_deg
    : aircraft.assigned?.heading_true_deg;
}

function executionSpeedKt(aircraft: AircraftState) {
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
    !aircraft.controller_speed_policy &&
    aircraft.speed_control_mode !== "released" &&
    typeof aircraft.speed_active_at_ms === "number" &&
    Number.isFinite(aircraft.speed_active_at_ms) &&
    typeof aircraft.assigned?.speed_kt === "number" &&
    Number.isFinite(aircraft.assigned.speed_kt)
  ) {
    return aircraft.assigned.speed_kt;
  }

  if (
    aircraft.speed_control_mode === "controller" &&
    !aircraft.controller_speed_policy &&
    typeof aircraft.assigned?.speed_kt === "number" &&
    Number.isFinite(aircraft.assigned.speed_kt)
  ) {
    return aircraft.assigned.speed_kt;
  }

  return undefined;
}

function executionAltitudeFt(aircraft: AircraftState) {
  return typeof aircraft.execution_altitude_ft === "number" &&
    Number.isFinite(aircraft.execution_altitude_ft)
    ? aircraft.execution_altitude_ft
    : aircraft.assigned?.altitude_ft;
}

function executionVerticalRateFpm(aircraft: AircraftState) {
  return typeof aircraft.execution_vertical_rate_fpm === "number" &&
    Number.isFinite(aircraft.execution_vertical_rate_fpm)
    ? aircraft.execution_vertical_rate_fpm
    : aircraft.assigned?.vertical_rate_fpm;
}

function turnRateDegSecForBank(
  performance: AircraftPerformanceProfile,
  groundSpeedKt: number,
  bankDeg: number
) {
  const bankAbsDeg = Math.min(Math.abs(bankDeg), performance.max_bank_deg);

  if (bankAbsDeg <= 0) {
    return 0;
  }

  if (!Number.isFinite(groundSpeedKt) || groundSpeedKt <= 0) {
    return performance.max_turn_rate_deg_sec;
  }

  const bankLimitedTurnRate = (1091 * Math.tan(toRadians(bankAbsDeg))) / groundSpeedKt;

  return Math.min(performance.max_turn_rate_deg_sec, Math.max(0.1, bankLimitedTurnRate));
}

function indicatedSpeedFromAircraft(aircraft: AircraftState) {
  if (typeof aircraft.indicated_speed_kt === "number" && Number.isFinite(aircraft.indicated_speed_kt)) {
    return Math.max(0, aircraft.indicated_speed_kt);
  }

  return Math.max(0, aircraft.ground_speed_kt);
}

function speedRateKtSec(
  aircraft: AircraftState,
  speedDeltaKt: number,
  altitudeFt: number,
  verticalRateFpm: number,
  performance: AircraftPerformanceProfile
) {
  if (speedDeltaKt === 0) {
    return 0;
  }

  const accelerating = speedDeltaKt > 0;
  let rateKtSec = accelerating ? performance.accel_kt_sec : performance.decel_kt_sec;

  if (accelerating && verticalRateFpm > 300) {
    rateKtSec *= performance.climb_accel_factor ?? 0.7;
  }

  if (accelerating && altitudeFt >= (performance.high_altitude_threshold_ft ?? 14000)) {
    rateKtSec *= performance.high_altitude_accel_factor ?? 0.65;
  }

  if (!accelerating && isApproachPhase(aircraft)) {
    rateKtSec *= performance.approach_decel_factor ?? 1.2;
  }

  return Math.max(0.02, rateKtSec);
}

function climbRateWithSpeedPlanning(
  aircraft: AircraftState,
  plannedClimbRateAbsFpm: number,
  currentTimeMs: number,
  performance: AircraftPerformanceProfile
) {
  const assignedSpeed = executionSpeedKt(aircraft);

  if (
    typeof assignedSpeed !== "number" ||
    !Number.isFinite(assignedSpeed) ||
    isPending(aircraft.speed_active_at_ms, currentTimeMs) ||
    !Number.isFinite(plannedClimbRateAbsFpm) ||
    plannedClimbRateAbsFpm <= 0
  ) {
    return plannedClimbRateAbsFpm;
  }

  const currentSpeedKt = indicatedSpeedFromAircraft(aircraft);
  const speedDeltaKt = assignedSpeed - currentSpeedKt;

  if (speedDeltaKt <= 1) {
    return plannedClimbRateAbsFpm;
  }

  const accelerationRateKtSec = speedRateKtSec(
    aircraft,
    speedDeltaKt,
    aircraft.altitude_ft,
    plannedClimbRateAbsFpm,
    performance
  );
  const penaltyFactor = performance.climb_acceleration_vertical_penalty_fpm_per_kt_sec ??
    DEFAULT_CLIMB_ACCEL_VERTICAL_PENALTY_FPM_PER_KT_SEC;
  const penaltyFpm = Math.max(0, accelerationRateKtSec * penaltyFactor);
  const minimumClimbRateFpm = Math.min(
    plannedClimbRateAbsFpm,
    performance.minimum_capture_vertical_rate_fpm ?? 300
  );

  return Math.max(minimumClimbRateFpm, plannedClimbRateAbsFpm - penaltyFpm);
}

function energyAdjustedBaseVerticalRateAbsFpm(
  aircraft: AircraftState,
  direction: number,
  baseDescentRateAbsFpm: number,
  performance: AircraftPerformanceProfile
) {
  if (
    !Number.isFinite(baseDescentRateAbsFpm) ||
    baseDescentRateAbsFpm <= 0 ||
    aircraft.approach_phase === "final" ||
    aircraft.approach_phase === "landed"
  ) {
    return baseDescentRateAbsFpm;
  }

  if (direction < 0 && aircraft.energy_mode === "expedite_descent") {
    const explicitExpediteRateFpm = performance.expedite_descent_fpm;
    const factor = performance.expedite_descent_rate_factor ?? DEFAULT_EXPEDITE_DESCENT_RATE_FACTOR;
    const expeditedRateFpm =
      typeof explicitExpediteRateFpm === "number" && Number.isFinite(explicitExpediteRateFpm)
        ? explicitExpediteRateFpm
        : baseDescentRateAbsFpm * factor;

    return Math.max(baseDescentRateAbsFpm, expeditedRateFpm);
  }

  if (direction > 0 && aircraft.energy_mode === "expedite_climb") {
    const explicitExpediteRateFpm = performance.expedite_climb_fpm;
    const factor = performance.expedite_climb_rate_factor ?? DEFAULT_EXPEDITE_CLIMB_RATE_FACTOR;
    const expeditedRateFpm =
      typeof explicitExpediteRateFpm === "number" && Number.isFinite(explicitExpediteRateFpm)
        ? explicitExpediteRateFpm
        : baseDescentRateAbsFpm * factor;

    return Math.max(baseDescentRateAbsFpm, expeditedRateFpm);
  }

  if (
    (direction < 0 && aircraft.energy_mode === "increase_descent_rate") ||
    (direction > 0 && aircraft.energy_mode === "increase_climb_rate")
  ) {
    const stepFpm = performance.increase_rate_step_fpm ?? DEFAULT_INCREASE_RATE_STEP_FPM;

    return baseDescentRateAbsFpm + Math.max(0, stepFpm);
  }

  return baseDescentRateAbsFpm;
}

function expediteDescentSpeedTargetKt(
  aircraft: AircraftState,
  altitudeFt: number,
  verticalRateFpm: number,
  performance: AircraftPerformanceProfile,
  motionSpeedConstraint?: MotionSpeedConstraint
) {
  if (
    aircraft.energy_mode !== "expedite_descent" ||
    aircraft.procedure_kind === "APP" ||
    aircraft.approach_phase === "final" ||
    aircraft.approach_phase === "landed" ||
    !hasDescentIntent(aircraft, verticalRateFpm)
  ) {
    return undefined;
  }

  const currentSpeedKt = indicatedSpeedFromAircraft(aircraft);
  const targetAltitudeFt = executionAltitudeFt(aircraft);
  const lowAltitudeSpeedLimitApplies =
    altitudeFt <= DESCENT_SPEED_GATE_ALTITUDE_FT ||
    (typeof targetAltitudeFt === "number" &&
      Number.isFinite(targetAltitudeFt) &&
      targetAltitudeFt <= DESCENT_SPEED_GATE_ALTITUDE_FT) ||
    Boolean(motionSpeedConstraint);
  const speedBiasKt = performance.expedite_descent_speed_bias_kt ?? DEFAULT_EXPEDITE_DESCENT_SPEED_BIAS_KT;
  const maxExpediteSpeedKt = performance.expedite_descent_max_speed_kt ?? DEFAULT_EXPEDITE_DESCENT_MAX_SPEED_KT;
  const maxSpeedKt = lowAltitudeSpeedLimitApplies
    ? Math.min(maxExpediteSpeedKt, DESCENT_SPEED_GATE_MAX_SPEED_KT)
    : maxExpediteSpeedKt;
  const targetSpeedKt = Math.min(currentSpeedKt + speedBiasKt, maxSpeedKt);

  return targetSpeedKt > currentSpeedKt + 1 ? targetSpeedKt : undefined;
}

function hasDescentIntent(aircraft: AircraftState, verticalRateFpm: number) {
  const targetAltitudeFt = executionAltitudeFt(aircraft);
  const targetVerticalRateFpm = executionVerticalRateFpm(aircraft);

  return (
    verticalRateFpm < -100 ||
    aircraft.vertical_rate_fpm < -100 ||
    (typeof targetVerticalRateFpm === "number" &&
      Number.isFinite(targetVerticalRateFpm) &&
      targetVerticalRateFpm < -100) ||
    (typeof targetAltitudeFt === "number" &&
      Number.isFinite(targetAltitudeFt) &&
      targetAltitudeFt < aircraft.altitude_ft - 100)
  );
}

function isApproachPhase(aircraft: AircraftState) {
  return (
    aircraft.flight_phase === "arrival" ||
    aircraft.procedure_kind === "STAR" ||
    aircraft.procedure_kind === "APP"
  );
}

function altitudeCaptureVerticalRate(
  baseVerticalRateFpm: number,
  altitudeDeltaAbsFt: number,
  performance: AircraftPerformanceProfile
) {
  const captureBandFt = Math.max(0, performance.altitude_capture_ft);
  const taperBandFt = Math.max(
    captureBandFt + 1,
    performance.altitude_capture_taper_ft ?? captureBandFt * 9
  );

  if (altitudeDeltaAbsFt >= taperBandFt) {
    return baseVerticalRateFpm;
  }

  const minimumVerticalRateFpm = Math.min(
    Math.abs(baseVerticalRateFpm),
    performance.minimum_capture_vertical_rate_fpm ?? 300
  );
  const taperRatio = clampNumber(
    (altitudeDeltaAbsFt - captureBandFt) / (taperBandFt - captureBandFt),
    0,
    1
  );

  return Math.max(minimumVerticalRateFpm, Math.abs(baseVerticalRateFpm) * taperRatio);
}

function descentSpeedGateLookahead(
  aircraft: AircraftState,
  currentTimeMs: number,
  performance: AircraftPerformanceProfile
): MotionSpeedConstraint | undefined {
  if (aircraft.flight_phase === "departure") {
    return undefined;
  }

  if (aircraft.altitude_ft <= DESCENT_SPEED_GATE_ALTITUDE_FT) {
    return undefined;
  }

  const currentSpeedKt = indicatedSpeedFromAircraft(aircraft);
  const releaseSpeedKt = DESCENT_SPEED_GATE_MAX_SPEED_KT + DESCENT_SPEED_GATE_RELEASE_MARGIN_KT;

  if (currentSpeedKt <= releaseSpeedKt) {
    return undefined;
  }

  const assignedAltitude = executionAltitudeFt(aircraft);
  const altitudeTargetActive =
    typeof assignedAltitude === "number" &&
    Number.isFinite(assignedAltitude) &&
    !isPending(aircraft.altitude_active_at_ms, currentTimeMs);
  const descendingToOrThroughGate =
    altitudeTargetActive && assignedAltitude <= DESCENT_SPEED_GATE_ALTITUDE_FT;
  const alreadyDescending = aircraft.vertical_rate_fpm < -100;

  if (!descendingToOrThroughGate && !alreadyDescending) {
    return undefined;
  }

  return {
    target_speed_kt: DESCENT_SPEED_GATE_MAX_SPEED_KT,
    target_altitude_ft: DESCENT_SPEED_GATE_ALTITUDE_FT,
    altitude_delta_to_target_ft: aircraft.altitude_ft - DESCENT_SPEED_GATE_ALTITUDE_FT
  };
}

function descentRateWithSpeedPlanning(
  aircraft: AircraftState,
  plannedDescentRateAbsFpm: number,
  altitudeDeltaAbsFt: number,
  currentTimeMs: number,
  performance: AircraftPerformanceProfile,
  motionSpeedConstraint?: MotionSpeedConstraint
) {
  const assignedSpeed = executionSpeedKt(aircraft);
  let plannedRateAbsFpm = plannedDescentRateAbsFpm;

  if (
    typeof assignedSpeed === "number" &&
    Number.isFinite(assignedSpeed) &&
    !isPending(aircraft.speed_active_at_ms, currentTimeMs)
  ) {
    plannedRateAbsFpm = limitDescentRateForSpeedTarget(
      aircraft,
      plannedRateAbsFpm,
      altitudeDeltaAbsFt,
      assignedSpeed,
      performance
    );
  }

  if (motionSpeedConstraint) {
    plannedRateAbsFpm = limitDescentRateForSpeedTarget(
      aircraft,
      plannedRateAbsFpm,
      motionSpeedConstraint.altitude_delta_to_target_ft,
      motionSpeedConstraint.target_speed_kt,
      performance
    );
  }

  return plannedRateAbsFpm;
}

function limitDescentRateForSpeedTarget(
  aircraft: AircraftState,
  plannedDescentRateAbsFpm: number,
  altitudeDeltaAbsFt: number,
  targetSpeedKt: number,
  performance: AircraftPerformanceProfile
) {
  if (
    typeof targetSpeedKt !== "number" ||
    !Number.isFinite(targetSpeedKt) ||
    !Number.isFinite(plannedDescentRateAbsFpm) ||
    plannedDescentRateAbsFpm <= 0
  ) {
    return plannedDescentRateAbsFpm;
  }

  const currentSpeedKt = indicatedSpeedFromAircraft(aircraft);
  const speedDeltaKt = currentSpeedKt - targetSpeedKt;

  if (speedDeltaKt <= 1 || altitudeDeltaAbsFt <= 0) {
    return plannedDescentRateAbsFpm;
  }

  const decelRateKtSec = speedRateKtSec(
    aircraft,
    -speedDeltaKt,
    aircraft.altitude_ft,
    -plannedDescentRateAbsFpm,
    performance
  );

  if (!Number.isFinite(decelRateKtSec) || decelRateKtSec <= 0) {
    return plannedDescentRateAbsFpm;
  }

  const decelBufferSec = Math.max(0, performance.deceleration_descent_buffer_sec ?? 10);
  const requiredDecelSeconds = speedDeltaKt / decelRateKtSec + decelBufferSec;

  if (!Number.isFinite(requiredDecelSeconds) || requiredDecelSeconds <= 0) {
    return plannedDescentRateAbsFpm;
  }

  const maxDescentRateForDecelFpm = (altitudeDeltaAbsFt / requiredDecelSeconds) * 60;

  if (!Number.isFinite(maxDescentRateForDecelFpm) || maxDescentRateForDecelFpm >= plannedDescentRateAbsFpm) {
    return plannedDescentRateAbsFpm;
  }

  return clampNumber(maxDescentRateForDecelFpm, 0, plannedDescentRateAbsFpm);
}

function pendingSpeedGateBoundaryState(
  aircraft: AircraftState,
  rawAltitudeFt: number,
  verticalRateFpm: number,
  motionSpeedConstraint?: MotionSpeedConstraint
) {
  if (!motionSpeedConstraint || verticalRateFpm >= 0) {
    return null;
  }

  if (aircraft.altitude_ft <= motionSpeedConstraint.target_altitude_ft) {
    return null;
  }

  if (rawAltitudeFt > motionSpeedConstraint.target_altitude_ft) {
    return null;
  }

  const currentSpeedKt = indicatedSpeedFromAircraft(aircraft);

  if (currentSpeedKt <= motionSpeedConstraint.target_speed_kt + DESCENT_SPEED_GATE_RELEASE_MARGIN_KT) {
    return null;
  }

  return {
    altitude_ft: aircraft.altitude_ft,
    vertical_rate_fpm: 0
  };
}

function speedGateRequiresHold(
  aircraft: AircraftState,
  motionSpeedConstraint?: MotionSpeedConstraint
) {
  return Boolean(
    motionSpeedConstraint &&
      aircraft.altitude_ft > motionSpeedConstraint.target_altitude_ft &&
      indicatedSpeedFromAircraft(aircraft) >
        motionSpeedConstraint.target_speed_kt + DESCENT_SPEED_GATE_RELEASE_MARGIN_KT
  );
}

function smoothVerticalRate(
  currentVerticalRateFpm: number,
  targetVerticalRateFpm: number,
  elapsedSeconds: number,
  performance: AircraftPerformanceProfile
) {
  if (!Number.isFinite(currentVerticalRateFpm)) {
    return targetVerticalRateFpm;
  }

  const rateChangeFpmSec = performance.vertical_rate_change_fpm_sec ?? 300;

  if (!Number.isFinite(rateChangeFpmSec) || rateChangeFpmSec <= 0) {
    return targetVerticalRateFpm;
  }

  return approachNumber(
    currentVerticalRateFpm,
    targetVerticalRateFpm,
    rateChangeFpmSec * Math.max(0, elapsedSeconds)
  );
}

function trueAirspeedFactorForAltitude(
  altitudeFt: number,
  performance: AircraftPerformanceProfile
) {
  const altitudeFactorPer1000Ft = performance.tas_factor_per_1000_ft ?? 0.012;
  const maxTasFactor = Math.max(1, performance.max_tas_factor ?? 1.3);
  const rawFactor = 1 + Math.max(0, altitudeFt) / 1000 * altitudeFactorPer1000Ft;

  return clampNumber(rawFactor, 1, maxTasFactor);
}

function buildTurnState(
  targetHeadingTrueDeg: number,
  bankAbsDeg: number,
  direction: -1 | 0 | 1
): AircraftTurnState | undefined {
  if (direction === 0 || bankAbsDeg <= 0.05) {
    return undefined;
  }

  return {
    target_heading_true_deg: normalizeHeading(targetHeadingTrueDeg),
    bank_deg: direction * bankAbsDeg,
    direction
  };
}

function turnDirection(headingDeltaDeg: number): -1 | 0 | 1 {
  if (headingDeltaDeg > 0) {
    return 1;
  }

  if (headingDeltaDeg < 0) {
    return -1;
  }

  return 0;
}

function shortestHeadingDelta(currentHeadingDeg: number, targetHeadingDeg: number) {
  return ((((normalizeHeading(targetHeadingDeg) - normalizeHeading(currentHeadingDeg) + 540) % 360) + 360) % 360) - 180;
}

function approachNumber(current: number, target: number, maxStep: number) {
  if (Math.abs(target - current) <= maxStep) {
    return target;
  }

  return current + Math.sign(target - current) * maxStep;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function isPending(activeAtMs: number | undefined, currentTimeMs: number) {
  return typeof activeAtMs === "number" && currentTimeMs < activeAtMs;
}

function normalizeHeading(headingTrueDeg: number) {
  return ((headingTrueDeg % 360) + 360) % 360;
}

function normalizeLongitude(longitude: number) {
  return ((((longitude + 180) % 360) + 360) % 360) - 180;
}

function toRadians(degrees: number) {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number) {
  return (radians * 180) / Math.PI;
}
