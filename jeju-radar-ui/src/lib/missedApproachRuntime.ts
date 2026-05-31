import { distanceNmBetweenPoints } from "./aircraftMotion";
import {
  callsignTelephonyText,
  digitsToTelephonyWords,
  sanitizeCallsign
} from "./callsignTelephony";
import {
  applyMissedApproachToAircraft,
  missedApproachProfileForAircraft
} from "./missedApproachProfiles";
import { resolveDirectFix } from "./procedureGuidance";
import type {
  AircraftState,
  MissedApproachProfile,
  RadarDataset
} from "./types";

export const MISSED_APPROACH_PROBABILITY_OPTIONS = [0, 5, 10, 20, 50, 100] as const;
export const DEFAULT_MISSED_APPROACH_TRIGGER_DISTANCE_NM = 5;

export type MissedApproachTriggerReason = "scenario_probability" | "glideslope_capture_failure";

export interface GlideslopeCaptureFailure {
  threshold_fix_id: string;
  landing_distance_nm: number;
  landing_required_vertical_rate_fpm?: number;
  status_reason?: string;
}

export interface MissedApproachCandidate {
  aircraft: AircraftState;
  dataset: RadarDataset;
  profile: MissedApproachProfile;
  probability_percent: number;
  distance_to_threshold_nm: number;
  threshold_fix_id: string;
  current_time_ms: number;
  trigger_reason: MissedApproachTriggerReason;
  glideslope_failure?: GlideslopeCaptureFailure;
}

export interface MissedApproachEvent {
  aircraft: AircraftState;
  profile: MissedApproachProfile;
  report_text: string;
  detail: string;
}

export function normalizeMissedApproachProbability(value: unknown) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(numericValue)));
}

export function missedApproachThresholdFixId(profile: MissedApproachProfile) {
  return profile.runway === "25" ? "RW250" : "RW070";
}

export function automaticMissedApproachCandidate({
  aircraft,
  dataset,
  probabilityPercent,
  currentTimeMs,
  triggerDistanceNm = DEFAULT_MISSED_APPROACH_TRIGGER_DISTANCE_NM
}: {
  aircraft: AircraftState;
  dataset: RadarDataset;
  probabilityPercent: number;
  currentTimeMs: number;
  triggerDistanceNm?: number;
}): MissedApproachCandidate | null {
  const normalizedProbabilityPercent = normalizeMissedApproachProbability(probabilityPercent);

  if (normalizedProbabilityPercent <= 0) {
    return null;
  }

  if (
    aircraft.landing_state === "landed" ||
    aircraft.approach_phase !== "final" ||
    aircraft.route_mode !== "procedure" ||
    aircraft.procedure_kind !== "APP" ||
    aircraft.missed_approach_profile_id
  ) {
    return null;
  }

  const profile = missedApproachProfileForAircraft(aircraft);

  if (!profile) {
    return null;
  }

  const thresholdFixId = missedApproachThresholdFixId(profile);
  const thresholdFix = resolveDirectFix(dataset, thresholdFixId);

  if (!thresholdFix) {
    return null;
  }

  const distanceToThresholdNm = distanceNmBetweenPoints(
    aircraft.latitude,
    aircraft.longitude,
    thresholdFix.latitude,
    thresholdFix.longitude
  );

  if (distanceToThresholdNm > triggerDistanceNm) {
    return null;
  }

  const glideslopeFailure = glideslopeCaptureFailureForAircraft(
    aircraft,
    thresholdFixId,
    distanceToThresholdNm
  );

  return {
    aircraft,
    dataset,
    profile,
    probability_percent: normalizedProbabilityPercent,
    distance_to_threshold_nm: distanceToThresholdNm,
    threshold_fix_id: thresholdFixId,
    current_time_ms: currentTimeMs,
    trigger_reason: glideslopeFailure ? "glideslope_capture_failure" : "scenario_probability",
    ...(glideslopeFailure ? { glideslope_failure: glideslopeFailure } : {})
  };
}

export function missedApproachEvaluationKey(candidate: MissedApproachCandidate) {
  return [
    candidate.aircraft.id,
    candidate.profile.id,
    candidate.trigger_reason,
    candidate.aircraft.procedure_id ?? "",
    candidate.aircraft.guidance_active_at_ms ?? 0
  ].join(":");
}

export function missedApproachProbabilityHit(
  candidate: MissedApproachCandidate,
  randomValue = Math.random()
) {
  if (candidate.trigger_reason === "glideslope_capture_failure") {
    return true;
  }

  return randomValue * 100 < candidate.probability_percent;
}

export function applyMissedApproachCandidate(candidate: MissedApproachCandidate): MissedApproachEvent | null {
  const result = applyMissedApproachToAircraft({
    aircraft: candidate.aircraft,
    dataset: candidate.dataset,
    profile: candidate.profile,
    activatedAtMs: candidate.current_time_ms
  });

  if (result.status !== "applied" || !result.aircraft) {
    return null;
  }

  return missedApproachEventFromAircraft(
    result.aircraft,
    candidate.profile,
    missedApproachCandidateDetail(candidate)
  );
}

export function applyMissedApproachForAircraft({
  aircraft,
  dataset,
  currentTimeMs
}: {
  aircraft: AircraftState;
  dataset: RadarDataset;
  currentTimeMs: number;
}): MissedApproachEvent | { error: string } {
  const profile = missedApproachProfileForAircraft(aircraft);
  const result = applyMissedApproachToAircraft({
    aircraft,
    dataset,
    profile,
    activatedAtMs: currentTimeMs
  });

  if (result.status !== "applied" || !result.aircraft || !result.profile) {
    return {
      error: result.reason ?? "missed approach could not be applied"
    };
  }

  return missedApproachEventFromAircraft(result.aircraft, result.profile, "forced tower missed approach event");
}

export function missedApproachReportText(aircraft: AircraftState, profile: MissedApproachProfile) {
  return `Jeju Approach, ${callsignTelephonyText(aircraft.callsign)}, going around, climbing ${altitudePhrase(
    profile.target_altitude_ft
  )}.`;
}

function missedApproachEventFromAircraft(
  aircraft: AircraftState,
  profile: MissedApproachProfile,
  detail: string
): MissedApproachEvent {
  return {
    aircraft,
    profile,
    report_text: missedApproachReportText(aircraft, profile),
    detail: `${sanitizeCallsign(aircraft.callsign)} ${profile.id}: ${detail}`
  };
}

function glideslopeCaptureFailureForAircraft(
  aircraft: AircraftState,
  thresholdFixId: string,
  distanceToThresholdNm: number
): GlideslopeCaptureFailure | null {
  const status = aircraft.guidance_status;

  if (
    status?.mode !== "approach" ||
    status.status !== "too_high" ||
    status.landing_feasible !== false
  ) {
    return null;
  }

  const statusFixId = status.active_fix_id ?? status.constraint_fix;

  if (statusFixId !== thresholdFixId) {
    return null;
  }

  const landingDistanceNm =
    typeof status.landing_distance_nm === "number" && Number.isFinite(status.landing_distance_nm)
      ? status.landing_distance_nm
      : distanceToThresholdNm;

  if (landingDistanceNm > DEFAULT_MISSED_APPROACH_TRIGGER_DISTANCE_NM) {
    return null;
  }

  return {
    threshold_fix_id: thresholdFixId,
    landing_distance_nm: landingDistanceNm,
    landing_required_vertical_rate_fpm: status.landing_required_vertical_rate_fpm,
    status_reason: status.reason
  };
}

function missedApproachCandidateDetail(candidate: MissedApproachCandidate) {
  if (candidate.trigger_reason !== "glideslope_capture_failure") {
    return `auto ${candidate.probability_percent}% at ${candidate.distance_to_threshold_nm.toFixed(1)}NM from ${candidate.threshold_fix_id}`;
  }

  const failure = candidate.glideslope_failure;
  const requiredRate =
    typeof failure?.landing_required_vertical_rate_fpm === "number" &&
    Number.isFinite(failure.landing_required_vertical_rate_fpm)
      ? `, required ${Math.round(failure.landing_required_vertical_rate_fpm)}fpm`
      : "";
  const distanceNm = failure?.landing_distance_nm ?? candidate.distance_to_threshold_nm;

  return `glideslope capture failure at ${distanceNm.toFixed(1)}NM from ${candidate.threshold_fix_id}${requiredRate}`;
}

function altitudePhrase(altitudeFt: number) {
  if (altitudeFt >= 1000 && altitudeFt % 1000 === 0) {
    return `${digitsToTelephonyWords(String(altitudeFt / 1000))} thousand`;
  }

  return digitsToTelephonyWords(String(Math.round(altitudeFt)));
}
