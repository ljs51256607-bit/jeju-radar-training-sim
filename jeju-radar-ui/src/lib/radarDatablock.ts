import type { AircraftFrequencyState, AircraftState } from "./types";

const ALTITUDE_TREND_THRESHOLD_FPM = 100;

export function altitudeTrend(target: Pick<AircraftState, "vertical_rate_fpm">) {
  const verticalRateFpm = Number.isFinite(target.vertical_rate_fpm) ? target.vertical_rate_fpm : 0;

  if (verticalRateFpm > ALTITUDE_TREND_THRESHOLD_FPM) {
    return "↑";
  }

  if (verticalRateFpm < -ALTITUDE_TREND_THRESHOLD_FPM) {
    return "↓";
  }

  return "";
}

export function guidanceStatusLabel(target: Pick<AircraftState, "guidance_status">) {
  return target.guidance_status?.display_label ?? "";
}

export function guidanceStatusClass(target: Pick<AircraftState, "guidance_status">) {
  const status = target.guidance_status?.status;

  if (status === "unable" || status === "too_high") {
    return "critical";
  }

  if (status === "late_descent" || status === "high_but_recoverable") {
    return "warning";
  }

  return "";
}

function datablockFrequencyState(
  target: Pick<AircraftState, "frequency_state" | "pilot_first_contact">
): AircraftFrequencyState {
  if (target.frequency_state) {
    return target.frequency_state;
  }

  if (target.pilot_first_contact?.done || target.pilot_first_contact?.awaiting_controller_response) {
    return "first_contacted";
  }

  if (target.pilot_first_contact) {
    return "not_on_frequency";
  }

  return "on_frequency";
}

export function frequencyStatusLabel(target: AircraftState) {
  if (target.pilot_first_contact?.last_jammed_at_ms && !target.pilot_first_contact.done) {
    return "JAM";
  }

  if (target.pilot_first_contact?.standby) {
    return "SBY";
  }

  switch (datablockFrequencyState(target)) {
    case "not_on_frequency":
      return "OFF";
    case "first_contacted":
      return "CALL";
    case "on_frequency":
      return "";
  }
}

export function frequencyStatusClass(target: AircraftState) {
  const label = frequencyStatusLabel(target);

  if (label === "JAM") {
    return "jammed";
  }

  if (label === "OFF") {
    return "off";
  }

  if (label === "CALL") {
    return "call";
  }

  if (label === "SBY") {
    return "standby";
  }

  return "";
}
