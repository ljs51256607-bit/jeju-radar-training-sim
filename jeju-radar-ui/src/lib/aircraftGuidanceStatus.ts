import { buildAircraftGuidancePlan, type AircraftGuidancePlan } from "./aircraftGuidancePlanner";
import type {
  AircraftGuidanceProfileStatus,
  AircraftGuidanceStatus,
  AircraftState,
  RadarDataset,
  WindSettings
} from "./types";

export function applyAircraftGuidanceStatus(
  aircraft: AircraftState,
  dataset: RadarDataset,
  currentTimeMs: number,
  options: { wind?: WindSettings } = {}
): AircraftState {
  const plan = buildAircraftGuidancePlan(aircraft, dataset, currentTimeMs, {
    wind: options.wind
  });

  return {
    ...aircraft,
    guidance_status: guidanceStatusForPlan(plan)
  };
}

export function guidanceStatusForPlan(plan: AircraftGuidancePlan): AircraftGuidanceStatus {
  const status = guidanceProfileStatus(plan);
  const displayLabel = guidanceDisplayLabel(status);

  return {
    generated_at_ms: plan.generated_at_ms,
    mode: plan.mode,
    active_fix_id: plan.active_fix_id,
    status,
    ...(displayLabel ? { display_label: displayLabel } : {}),
    reason: guidanceStatusReason(plan, status),
    constraint_fix: plan.vertical.constraint_fix ?? plan.speed.constraint_fix,
    target_altitude_ft: plan.vertical.target_altitude_ft,
    target_speed_kt: plan.speed.target_speed_kt,
    target_vertical_rate_fpm: plan.vertical.target_vertical_rate_fpm,
    required_vertical_rate_fpm: plan.vertical.required_vertical_rate_fpm,
    max_vertical_rate_fpm: plan.vertical.max_vertical_rate_fpm,
    required_climb_gradient_ft_per_nm: plan.vertical.required_climb_gradient_ft_per_nm,
    max_climb_gradient_ft_per_nm: plan.vertical.max_climb_gradient_ft_per_nm,
    climb_gradient_feasible: plan.vertical.climb_gradient_feasible,
    remaining_distance_nm: plan.vertical.remaining_distance_nm ?? plan.speed.remaining_distance_nm,
    late_by_nm: plan.speed.late_by_nm,
    landing_feasible: plan.vertical.landing_feasible,
    landing_required_vertical_rate_fpm: plan.vertical.landing_required_vertical_rate_fpm,
    landing_distance_nm: plan.vertical.landing_distance_nm
  };
}

function guidanceProfileStatus(plan: AircraftGuidancePlan): AircraftGuidanceProfileStatus {
  if (plan.vertical.profile_status === "unable") {
    return "unable";
  }

  if (plan.vertical.profile_status === "too_high") {
    return "too_high";
  }

  if (!plan.speed.feasible) {
    return "late_descent";
  }

  if (plan.vertical.profile_status === "high_but_recoverable") {
    return "high_but_recoverable";
  }

  return "stable";
}

function guidanceDisplayLabel(status: AircraftGuidanceProfileStatus) {
  if (status === "unable") {
    return "UNABLE" as const;
  }

  if (status === "late_descent") {
    return "LATE" as const;
  }

  if (status === "too_high" || status === "high_but_recoverable") {
    return "HIGH" as const;
  }

  return undefined;
}

function guidanceStatusReason(plan: AircraftGuidancePlan, status: AircraftGuidanceProfileStatus) {
  if (status === "late_descent") {
    return plan.speed.reason;
  }

  return plan.vertical.reason ?? plan.speed.reason;
}
