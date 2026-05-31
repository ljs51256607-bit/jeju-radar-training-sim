import { distanceNmBetweenPoints } from "./aircraftMotion";
import {
  currentIndicatedSpeedKt,
  procedureSpeedRestrictionShouldActivate,
  speedTargetForAutomation
} from "./aircraftSpeedPlanning";
import { speedRestrictionCanceled } from "./procedureRestrictionState";
import type {
  AircraftControllerSpeedPolicy,
  AircraftSpeedReleaseCondition,
  AircraftState,
  FlightProfileRecord,
  RadarDataset
} from "./types";

export { currentIndicatedSpeedKt } from "./aircraftSpeedPlanning";

interface DirectFixTarget {
  id: string;
  latitude: number;
  longitude: number;
}

const FALLBACK_FLIGHT_PROFILE: FlightProfileRecord = {
  id: "fallback_rkpc_training_default",
  arrival: {
    entry_speed_kt: { min: 280, max: 300 },
    speed_gate: {
      altitude_ft: 10000,
      max_speed_kt: 250,
      release_margin_kt: 1
    },
    minimum_speed_command: {
      target_speed_kt: 155,
      typical_below_altitude_ft: 5000
    },
    approach_landing_speed: {
      threshold_distance_nm: 5,
      default_speed_kt: 145,
      by_aircraft_type: {
        B737: 145,
        B738: 145,
        A320: 135,
        A321: 135
      }
    },
    default_descent_fpm: 1500,
    default_climb_fpm: 1800,
    procedure_speed_max_kt: {
      MANBA: 220,
      YUMIN: 195,
      DUKAL: 195,
      LIMSO: 180,
      TOKIN: 180,
      RW070: 160,
      RW250: 160
    },
    approach_phase_speed_max_kt: {
      initial: 195,
      intermediate: 180,
      final: 160
    }
  },
  departure: {
    below_10000_speed_kt: 250,
    above_10000_speed_kt: 300,
    speed_transition_altitude_ft: 10000,
    initial_climb_fpm: 2200,
    mid_climb_fpm: 1800,
    default_descent_fpm: 1500
  }
};

const FALLBACK_GLOBAL_MAX_SPEED_KT = 310;
const FALLBACK_MINIMUM_SPEED_COMMAND_TARGET_KT = 155;
const FALLBACK_APPROACH_LANDING_DISTANCE_NM = 5;
const FALLBACK_APPROACH_LANDING_SPEED_KT = 145;
const SPEED_RESTRICTION_CONFLICT_PROMPT_DISTANCE_NM = 5;

export interface PublishedSpeedRestrictionConflict {
  fix_id: string;
  speed_cap_kt: number;
  distance_nm: number;
  controller_speed_kt: number;
  controller_policy_type: AircraftControllerSpeedPolicy["type"];
  requires_prompt: boolean;
}
export function flightProfileForDataset(dataset: RadarDataset): FlightProfileRecord {
  return (
    dataset.flightProfiles.profiles.find(
      (profile) => profile.id === dataset.flightProfiles.default_profile_id
    ) ??
    dataset.flightProfiles.profiles[0] ??
    FALLBACK_FLIGHT_PROFILE
  );
}

export function randomArrivalEntrySpeedKt(dataset: RadarDataset, random = Math.random) {
  const range = flightProfileForDataset(dataset).arrival.entry_speed_kt;
  const min = Math.ceil(Math.min(range.min, range.max));
  const max = Math.floor(Math.max(range.min, range.max));

  return min + Math.floor(clampNumber(random(), 0, 0.999999) * (max - min + 1));
}

export function minimumSpeedCommandTargetKt(dataset: RadarDataset) {
  const profile = flightProfileForDataset(dataset);
  const targetSpeedKt = profile.arrival.minimum_speed_command?.target_speed_kt;

  return typeof targetSpeedKt === "number" && Number.isFinite(targetSpeedKt)
    ? targetSpeedKt
    : FALLBACK_MINIMUM_SPEED_COMMAND_TARGET_KT;
}

export function controllerSpeedAssigned(aircraft: AircraftState) {
  return aircraft.speed_control_mode === "controller" && Boolean(controllerSpeedPolicy(aircraft));
}

export function departureManagedSpeedKt(aircraft: AircraftState, dataset: RadarDataset) {
  const profile = flightProfileForDataset(dataset);

  return aircraft.altitude_ft > profile.departure.speed_transition_altitude_ft
    ? profile.departure.above_10000_speed_kt
    : profile.departure.below_10000_speed_kt;
}

export function applyFlightProfileAutomation(
  aircraft: AircraftState,
  dataset: RadarDataset,
  currentTimeMs: number
): AircraftState {
  const profile = flightProfileForDataset(dataset);
  let nextAircraft: AircraftState = {
    ...aircraft,
    assigned: {
      ...aircraft.assigned
    }
  };

  nextAircraft = releaseConditionalSpeedPolicyIfSatisfied(nextAircraft, dataset, currentTimeMs);
  nextAircraft = applyManagedSpeed(nextAircraft, dataset, profile, currentTimeMs);
  nextAircraft = applyArrivalSpeedGate(nextAircraft, profile, currentTimeMs);

  return nextAircraft;
}

function releaseConditionalSpeedPolicyIfSatisfied(
  aircraft: AircraftState,
  dataset: RadarDataset,
  activeAtMs: number
) {
  const policy = aircraft.controller_speed_policy;
  const releaseCondition = policy?.release_condition;

  if (!policy || !releaseCondition || !speedReleaseConditionSatisfied(aircraft, releaseCondition)) {
    return aircraft;
  }

  return resumeNormalSpeed(aircraft, dataset, activeAtMs);
}

function speedReleaseConditionSatisfied(
  aircraft: AircraftState,
  releaseCondition: AircraftSpeedReleaseCondition
) {
  if (releaseCondition.type === "passing_altitude") {
    if (aircraft.flight_phase === "departure") {
      return aircraft.altitude_ft >= releaseCondition.altitude_ft;
    }

    return aircraft.altitude_ft <= releaseCondition.altitude_ft;
  }

  const releaseFixId = normalizeFixId(releaseCondition.fix_id);
  const route = aircraft.procedure_route?.map(normalizeFixId) ?? [];
  const releaseFixIndex = route.indexOf(releaseFixId);

  if (releaseFixIndex < 0) {
    const nextFix = aircraft.next_fix ? normalizeFixId(aircraft.next_fix) : null;

    return nextFix !== releaseFixId;
  }

  return (aircraft.procedure_route_index ?? 0) > releaseFixIndex;
}

export function resumeNormalSpeed(
  aircraft: AircraftState,
  dataset: RadarDataset,
  activeAtMs: number
): AircraftState {
  if (aircraft.flight_phase === "departure") {
    return {
      ...aircraft,
      speed_control_mode: "managed",
      controller_assigned_speed_kt: undefined,
      controller_speed_policy: undefined,
      execution_speed_kt: departureManagedSpeedKt(aircraft, dataset),
      speed_active_at_ms: activeAtMs
    };
  }

  return {
    ...aircraft,
    speed_control_mode: "released",
    controller_assigned_speed_kt: undefined,
    controller_speed_policy: undefined,
    execution_speed_kt: currentIndicatedSpeedKt(aircraft),
    speed_active_at_ms: activeAtMs
  };
}

export function resumeNormalVerticalMode(
  aircraft: AircraftState,
  dataset: RadarDataset,
  mode: "climb" | "descent",
  activeAtMs: number
): AircraftState {
  const profile = flightProfileForDataset(dataset);
  const verticalRateFpm =
    aircraft.flight_phase === "departure"
      ? mode === "climb"
        ? profile.departure.initial_climb_fpm
        : -profile.departure.default_descent_fpm
      : mode === "climb"
        ? profile.arrival.default_climb_fpm
        : -profile.arrival.default_descent_fpm;

  return {
    ...aircraft,
    altitude_control_mode: "managed",
    vertical_rate_control_mode: "managed",
    vertical_procedure_mode: "controller",
    execution_altitude_ft: undefined,
    execution_vertical_rate_fpm: verticalRateFpm,
    managed_altitude_constraint_fix: undefined,
    managed_altitude_constraint_ft: undefined,
    managed_vertical_rate_fpm: undefined,
    pending_descent_altitude_ft: undefined,
    energy_mode: "normal",
    vertical_rate_active_at_ms: activeAtMs
  };
}

export function canExpediteDescent(aircraft: AircraftState) {
  const targetAltitudeFt = aircraft.execution_altitude_ft ?? aircraft.assigned?.altitude_ft ?? aircraft.pending_descent_altitude_ft;
  const targetVerticalRateFpm = aircraft.execution_vertical_rate_fpm ?? aircraft.assigned?.vertical_rate_fpm;

  return (
    aircraft.vertical_rate_fpm < -100 ||
    (typeof targetVerticalRateFpm === "number" && Number.isFinite(targetVerticalRateFpm) && targetVerticalRateFpm < -100) ||
    (typeof targetAltitudeFt === "number" &&
      Number.isFinite(targetAltitudeFt) &&
      targetAltitudeFt < aircraft.altitude_ft - 100)
  );
}

export function canExpediteClimb(aircraft: AircraftState) {
  const targetAltitudeFt = aircraft.execution_altitude_ft ?? aircraft.assigned?.altitude_ft;
  const targetVerticalRateFpm = aircraft.execution_vertical_rate_fpm ?? aircraft.assigned?.vertical_rate_fpm;

  return (
    aircraft.vertical_rate_fpm > 100 ||
    (typeof targetVerticalRateFpm === "number" && Number.isFinite(targetVerticalRateFpm) && targetVerticalRateFpm > 100) ||
    (typeof targetAltitudeFt === "number" &&
      Number.isFinite(targetAltitudeFt) &&
      targetAltitudeFt > aircraft.altitude_ft + 100)
  );
}

export function expediteDescent(
  aircraft: AircraftState,
  dataset: RadarDataset,
  activeAtMs: number
): AircraftState {
  const profile = flightProfileForDataset(dataset);
  const existingVerticalTargetFpm =
    typeof aircraft.execution_vertical_rate_fpm === "number" &&
    Number.isFinite(aircraft.execution_vertical_rate_fpm)
      ? aircraft.execution_vertical_rate_fpm
      : aircraft.assigned?.vertical_rate_fpm;
  const hasAltitudeTarget =
    typeof (aircraft.execution_altitude_ft ?? aircraft.assigned?.altitude_ft ?? aircraft.pending_descent_altitude_ft) === "number";

  return {
    ...aircraft,
    altitude_control_mode: "managed",
    vertical_rate_control_mode: "managed",
    energy_mode: "expedite_descent",
    execution_vertical_rate_fpm:
      !hasAltitudeTarget && typeof existingVerticalTargetFpm === "number" && existingVerticalTargetFpm < 0
        ? existingVerticalTargetFpm
        : hasAltitudeTarget
          ? aircraft.execution_vertical_rate_fpm
          : -profile.arrival.default_descent_fpm,
    vertical_rate_active_at_ms: activeAtMs
  };
}

export function expediteClimb(
  aircraft: AircraftState,
  dataset: RadarDataset,
  activeAtMs: number
): AircraftState {
  const profile = flightProfileForDataset(dataset);
  const existingVerticalTargetFpm =
    typeof aircraft.execution_vertical_rate_fpm === "number" &&
    Number.isFinite(aircraft.execution_vertical_rate_fpm)
      ? aircraft.execution_vertical_rate_fpm
      : aircraft.assigned?.vertical_rate_fpm;
  const hasAltitudeTarget =
    typeof (aircraft.execution_altitude_ft ?? aircraft.assigned?.altitude_ft) === "number";
  const defaultClimbFpm = aircraft.flight_phase === "departure"
    ? profile.departure.initial_climb_fpm
    : profile.arrival.default_climb_fpm;

  return {
    ...aircraft,
    altitude_control_mode: "managed",
    vertical_rate_control_mode: "managed",
    energy_mode: "expedite_climb",
    execution_vertical_rate_fpm:
      !hasAltitudeTarget && typeof existingVerticalTargetFpm === "number" && existingVerticalTargetFpm > 0
        ? existingVerticalTargetFpm
        : hasAltitudeTarget
          ? aircraft.execution_vertical_rate_fpm
          : defaultClimbFpm,
    vertical_rate_active_at_ms: activeAtMs
  };
}

export function increaseVerticalRate(
  aircraft: AircraftState,
  dataset: RadarDataset,
  mode: "climb" | "descent",
  activeAtMs: number
): AircraftState {
  const profile = flightProfileForDataset(dataset);
  const existingVerticalTargetFpm =
    typeof aircraft.execution_vertical_rate_fpm === "number" &&
    Number.isFinite(aircraft.execution_vertical_rate_fpm)
      ? aircraft.execution_vertical_rate_fpm
      : aircraft.assigned?.vertical_rate_fpm;
  const hasAltitudeTarget =
    typeof (aircraft.execution_altitude_ft ?? aircraft.assigned?.altitude_ft ?? aircraft.pending_descent_altitude_ft) === "number";
  const defaultVerticalRateFpm = mode === "climb"
    ? aircraft.flight_phase === "departure"
      ? profile.departure.initial_climb_fpm
      : profile.arrival.default_climb_fpm
    : -profile.arrival.default_descent_fpm;

  return {
    ...aircraft,
    altitude_control_mode: "managed",
    vertical_rate_control_mode: "managed",
    energy_mode: mode === "climb" ? "increase_climb_rate" : "increase_descent_rate",
    execution_vertical_rate_fpm:
      !hasAltitudeTarget &&
      typeof existingVerticalTargetFpm === "number" &&
      Math.sign(existingVerticalTargetFpm) === (mode === "climb" ? 1 : -1)
        ? existingVerticalTargetFpm
        : hasAltitudeTarget
          ? aircraft.execution_vertical_rate_fpm
          : defaultVerticalRateFpm,
    vertical_rate_active_at_ms: activeAtMs
  };
}

function applyManagedSpeed(
  aircraft: AircraftState,
  dataset: RadarDataset,
  profile: FlightProfileRecord,
  currentTimeMs: number
): AircraftState {
  const currentSpeedKt = currentIndicatedSpeedKt(aircraft);
  const envelope = speedEnvelopeForAircraft(aircraft, dataset, profile);
  const maxSpeedKt = envelope.max_speed_kt;
  const managedMaxSpeedKt = envelope.managed_max_speed_kt;
  const managedMinSpeedKt = envelope.min_speed_kt;
  const policy = controllerSpeedPolicy(aircraft);

  if (aircraft.flight_phase === "departure") {
    if (policy) {
      const executionSpeedKt = executionSpeedForPolicy(policy, currentSpeedKt, managedMinSpeedKt, maxSpeedKt);

      return {
        ...aircraft,
        execution_speed_kt: executionSpeedKt,
        managed_speed_kt: managedMaxSpeedKt
      };
    }

    const managedDepartureSpeedKt =
      aircraft.altitude_ft > profile.departure.speed_transition_altitude_ft
        ? profile.departure.above_10000_speed_kt
        : profile.departure.below_10000_speed_kt;
    const boundedDepartureSpeedKt = clampSpeed(managedDepartureSpeedKt, managedMinSpeedKt, maxSpeedKt);

    return {
      ...aircraft,
      execution_speed_kt: boundedDepartureSpeedKt,
      speed_control_mode: "managed",
      managed_speed_kt: boundedDepartureSpeedKt
    };
  }

  if (policy) {
    const executionSpeedKt = executionSpeedForPolicy(policy, currentSpeedKt, managedMinSpeedKt, maxSpeedKt);

    return {
      ...aircraft,
      execution_speed_kt: executionSpeedKt,
      managed_speed_kt: managedMaxSpeedKt
    };
  }

  if (typeof maxSpeedKt === "number") {
    const existingTargetSpeedKt = speedTargetForAutomation(aircraft, currentSpeedKt);
    const referenceSpeedKt = Math.max(existingTargetSpeedKt, currentSpeedKt);

    if (referenceSpeedKt > maxSpeedKt) {
      return {
        ...aircraft,
        execution_speed_kt: clampSpeed(
          Math.min(existingTargetSpeedKt, currentSpeedKt),
          managedMinSpeedKt,
          maxSpeedKt
        ),
        speed_control_mode: "managed",
        managed_speed_kt: managedMaxSpeedKt,
        speed_active_at_ms: activateManagedRestriction(aircraft.speed_active_at_ms, currentTimeMs)
      };
    }
  }

  if (typeof managedMinSpeedKt === "number" && currentSpeedKt < managedMinSpeedKt - 1) {
    return {
      ...aircraft,
      execution_speed_kt: managedMinSpeedKt,
      speed_control_mode: "managed",
      managed_speed_kt: managedMaxSpeedKt,
      speed_active_at_ms: activateManagedRestriction(aircraft.speed_active_at_ms, currentTimeMs)
    };
  }

  if (aircraft.speed_control_mode === "released") {
    return {
      ...aircraft,
      execution_speed_kt: clampSpeed(
        Math.min(speedTargetForAutomation(aircraft, currentSpeedKt), currentSpeedKt),
        managedMinSpeedKt,
        maxSpeedKt
      ),
      managed_speed_kt: managedMaxSpeedKt
    };
  }

  return {
    ...aircraft,
    managed_speed_kt: managedMaxSpeedKt
  };
}

function applyArrivalSpeedGate(
  aircraft: AircraftState,
  profile: FlightProfileRecord,
  currentTimeMs: number
): AircraftState {
  if (aircraft.flight_phase !== "arrival") {
    return aircraft;
  }

  const gate = profile.arrival.speed_gate;
  const assignedAltitudeFt = aircraft.assigned?.altitude_ft;
  const altitudeAssignmentActive = !isPending(aircraft.altitude_active_at_ms, currentTimeMs);

  if (
    typeof assignedAltitudeFt !== "number" ||
    !Number.isFinite(assignedAltitudeFt) ||
    !altitudeAssignmentActive
  ) {
    return {
      ...aircraft,
      pending_descent_altitude_ft: undefined
    };
  }

  const currentSpeedKt = currentIndicatedSpeedKt(aircraft);
  const releaseSpeedKt = gate.max_speed_kt + (gate.release_margin_kt ?? 0);
  const hasPendingDescent =
    typeof aircraft.pending_descent_altitude_ft === "number" &&
    Number.isFinite(aircraft.pending_descent_altitude_ft);
  const targetBelowGate = assignedAltitudeFt < gate.altitude_ft || hasPendingDescent;
  const needsSpeedGate =
    targetBelowGate &&
    aircraft.altitude_ft > gate.altitude_ft &&
    currentSpeedKt > releaseSpeedKt;

  if (needsSpeedGate) {
    return {
      ...aircraft,
      pending_descent_altitude_ft: hasPendingDescent
        ? aircraft.pending_descent_altitude_ft
        : assignedAltitudeFt,
      altitude_active_at_ms: activateManagedRestriction(aircraft.altitude_active_at_ms, currentTimeMs),
      speed_active_at_ms: activateManagedRestriction(aircraft.speed_active_at_ms, currentTimeMs)
    };
  }

  if (hasPendingDescent && currentSpeedKt <= releaseSpeedKt) {
    const executionAltitudeFt =
      aircraft.execution_altitude_ft === gate.altitude_ft ? undefined : aircraft.execution_altitude_ft;
    return {
      ...aircraft,
      execution_altitude_ft: executionAltitudeFt,
      pending_descent_altitude_ft: undefined
    };
  }

  return aircraft;
}

function managedSpeedMaxKt(
  aircraft: AircraftState,
  dataset: RadarDataset,
  profile: FlightProfileRecord
) {
  return speedEnvelopeForAircraft(aircraft, dataset, profile).max_speed_kt;
}

function speedEnvelopeForAircraft(
  aircraft: AircraftState,
  dataset: RadarDataset,
  profile: FlightProfileRecord
) {
  const maxLimits: number[] = [profile.global_max_speed_kt ?? FALLBACK_GLOBAL_MAX_SPEED_KT];
  const managedMaxLimits: number[] = [];
  const minLimits: number[] = [];
  const gate = profile.arrival.speed_gate;
  const policy = controllerSpeedPolicy(aircraft);

  if (
    aircraft.flight_phase !== "overflight" &&
    (
    aircraft.altitude_ft <= gate.altitude_ft ||
    (typeof aircraft.assigned?.altitude_ft === "number" &&
      aircraft.assigned.altitude_ft < gate.altitude_ft) ||
    typeof aircraft.pending_descent_altitude_ft === "number"
    )
  ) {
    maxLimits.push(gate.max_speed_kt);
    managedMaxLimits.push(gate.max_speed_kt);
  }

  if (policy?.type === "minimum") {
    minLimits.push(policy.speed_kt);
  }

  if (policy?.type === "maximum") {
    maxLimits.push(policy.speed_kt);
    managedMaxLimits.push(policy.speed_kt);
  }

  const targetFixLimit = procedureSpeedLookaheadMaxKt(aircraft, dataset, profile);

  if (typeof targetFixLimit === "number") {
    maxLimits.push(targetFixLimit);
    managedMaxLimits.push(targetFixLimit);
  }

  const approachPhase =
    aircraft.route_mode === "procedure" && aircraft.procedure_kind === "APP"
      ? aircraft.approach_phase
      : undefined;
  const phaseLimit =
    approachPhase && profile.arrival.approach_phase_speed_max_kt[approachPhase];

  if (typeof phaseLimit === "number") {
    maxLimits.push(phaseLimit);
    managedMaxLimits.push(phaseLimit);
  }

  const landingSpeedLimit = approachLandingSpeedMaxKt(aircraft, dataset, profile);

  if (typeof landingSpeedLimit === "number") {
    maxLimits.push(landingSpeedLimit);
    managedMaxLimits.push(landingSpeedLimit);
  }

  return {
    min_speed_kt: minLimits.length > 0 ? Math.max(...minLimits) : undefined,
    max_speed_kt: maxLimits.length > 0 ? Math.min(...maxLimits) : undefined,
    managed_max_speed_kt: managedMaxLimits.length > 0 ? Math.min(...managedMaxLimits) : undefined
  };
}

function approachLandingSpeedMaxKt(
  aircraft: AircraftState,
  dataset: RadarDataset,
  profile: FlightProfileRecord
) {
  if (aircraft.route_mode !== "procedure" || aircraft.procedure_kind !== "APP") {
    return undefined;
  }

  const thresholdFixId = approachThresholdFixId(aircraft);

  if (!thresholdFixId) {
    return undefined;
  }

  const thresholdFix = resolveDirectFix(dataset, thresholdFixId);

  if (!thresholdFix) {
    return undefined;
  }

  const landingRule = profile.arrival.approach_landing_speed;
  const thresholdDistanceNm =
    typeof landingRule?.threshold_distance_nm === "number" &&
    Number.isFinite(landingRule.threshold_distance_nm)
      ? landingRule.threshold_distance_nm
      : FALLBACK_APPROACH_LANDING_DISTANCE_NM;
  const distanceToThresholdNm = distanceNmBetweenPoints(
    aircraft.latitude,
    aircraft.longitude,
    thresholdFix.latitude,
    thresholdFix.longitude
  );

  if (distanceToThresholdNm > thresholdDistanceNm) {
    return undefined;
  }

  return landingSpeedForAircraftType(aircraft.aircraft_type, profile);
}

function approachThresholdFixId(aircraft: AircraftState) {
  const route = aircraft.procedure_route?.map(normalizeFixId) ?? [];
  const lastRouteFix = route.length > 0 ? route[route.length - 1] : undefined;

  if (lastRouteFix?.startsWith("RW")) {
    return lastRouteFix;
  }

  const nextFix = aircraft.next_fix ? normalizeFixId(aircraft.next_fix) : undefined;

  return nextFix?.startsWith("RW") ? nextFix : undefined;
}

function landingSpeedForAircraftType(aircraftType: string, profile: FlightProfileRecord) {
  const landingRule = profile.arrival.approach_landing_speed;
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
    : FALLBACK_APPROACH_LANDING_SPEED_KT;
}

function normalizeAircraftType(aircraftType: string) {
  return aircraftType.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function procedureSpeedLookaheadMaxKt(
  aircraft: AircraftState,
  dataset: RadarDataset,
  profile: FlightProfileRecord
) {
  if (aircraft.route_mode !== "procedure" || !aircraft.procedure_route?.length) {
    return undefined;
  }

  const route = aircraft.procedure_route.map(normalizeFixId);
  const routeIndex = clampNumber(aircraft.procedure_route_index ?? 0, 0, Math.max(0, route.length - 1));
  const speedLimits: number[] = [];

  for (let index = routeIndex; index < route.length; index += 1) {
    const speedLimitKt = profile.arrival.procedure_speed_max_kt[route[index]];

    if (
      typeof speedLimitKt !== "number" ||
      !Number.isFinite(speedLimitKt) ||
      speedRestrictionCanceled(aircraft, route[index])
    ) {
      continue;
    }

    const distanceToFixNm = distanceAlongRouteNm(aircraft, dataset, route, routeIndex, index);

    if (distanceToFixNm === null) {
      if (index === routeIndex) {
        speedLimits.push(speedLimitKt);
      }

      continue;
    }

    if (procedureSpeedRestrictionShouldActivate(aircraft, speedLimitKt, distanceToFixNm)) {
      speedLimits.push(speedLimitKt);
    }
  }

  return speedLimits.length > 0 ? Math.min(...speedLimits) : undefined;
}

export function publishedSpeedRestrictionConflict(
  aircraft: AircraftState,
  dataset: RadarDataset,
  overridePolicy?: AircraftControllerSpeedPolicy
): PublishedSpeedRestrictionConflict | null {
  if (aircraft.route_mode !== "procedure" || !aircraft.procedure_route?.length) {
    return null;
  }

  const profile = flightProfileForDataset(dataset);
  const policy = overridePolicy ?? controllerSpeedPolicy(aircraft);

  if (!policy || policy.type === "maximum") {
    return null;
  }

  const controllerSpeedKt = policy.speed_kt;
  const route = aircraft.procedure_route.map(normalizeFixId);
  const routeIndex = clampNumber(aircraft.procedure_route_index ?? 0, 0, Math.max(0, route.length - 1));

  for (let index = routeIndex; index < route.length; index += 1) {
    const fixId = route[index];
    const speedLimitKt = profile.arrival.procedure_speed_max_kt[fixId];

    if (
      typeof speedLimitKt !== "number" ||
      !Number.isFinite(speedLimitKt) ||
      speedRestrictionCanceled(aircraft, fixId) ||
      controllerSpeedKt <= speedLimitKt
    ) {
      continue;
    }

    const distanceNm = distanceAlongRouteNm(aircraft, dataset, route, routeIndex, index);

    if (typeof distanceNm !== "number" || !Number.isFinite(distanceNm)) {
      continue;
    }

    return {
      fix_id: fixId,
      speed_cap_kt: speedLimitKt,
      distance_nm: distanceNm,
      controller_speed_kt: controllerSpeedKt,
      controller_policy_type: policy.type,
      requires_prompt: distanceNm <= SPEED_RESTRICTION_CONFLICT_PROMPT_DISTANCE_NM
    };
  }

  return null;
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

function normalizeFixId(fixId: string) {
  return fixId.trim().toUpperCase();
}

function controllerSpeedPolicy(aircraft: AircraftState): AircraftControllerSpeedPolicy | null {
  if (aircraft.speed_control_mode !== "controller") {
    return null;
  }

  if (
    aircraft.controller_speed_policy &&
    typeof aircraft.controller_speed_policy.speed_kt === "number" &&
    Number.isFinite(aircraft.controller_speed_policy.speed_kt)
  ) {
    return aircraft.controller_speed_policy;
  }

  if (
    typeof aircraft.controller_assigned_speed_kt === "number" &&
    Number.isFinite(aircraft.controller_assigned_speed_kt)
  ) {
    return {
      type: "target",
      speed_kt: aircraft.controller_assigned_speed_kt
    };
  }

  return null;
}

function executionSpeedForPolicy(
  policy: AircraftControllerSpeedPolicy,
  currentSpeedKt: number,
  minSpeedKt: number | undefined,
  maxSpeedKt: number | undefined
) {
  if (policy.type === "target") {
    return clampSpeed(policy.speed_kt, minSpeedKt, maxSpeedKt);
  }

  if (policy.type === "minimum") {
    return clampSpeed(Math.max(currentSpeedKt, policy.speed_kt), minSpeedKt, maxSpeedKt);
  }

  if (policy.type === "minimum_practical") {
    return clampSpeed(Math.min(currentSpeedKt, policy.speed_kt), minSpeedKt, maxSpeedKt);
  }

  return clampSpeed(Math.min(currentSpeedKt, policy.speed_kt), minSpeedKt, maxSpeedKt);
}

function clampSpeed(speedKt: number, minSpeedKt: number | undefined, maxSpeedKt: number | undefined) {
  let result = speedKt;

  if (typeof minSpeedKt === "number" && Number.isFinite(minSpeedKt)) {
    result = Math.max(result, minSpeedKt);
  }

  if (typeof maxSpeedKt === "number" && Number.isFinite(maxSpeedKt)) {
    result = Math.min(result, maxSpeedKt);
  }

  return result;
}

function activateManagedRestriction(activeAtMs: number | undefined, currentTimeMs: number) {
  return typeof activeAtMs === "number" && activeAtMs > currentTimeMs ? currentTimeMs : activeAtMs;
}

function isPending(activeAtMs: number | undefined, currentTimeMs: number) {
  return typeof activeAtMs === "number" && currentTimeMs < activeAtMs;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
