import type { ParsedAtcCommand } from "./atcCommandParser";
import {
  applyScopedLevelRestrictionCancellation,
  applyScopedSpeedRestrictionCancellation
} from "./aircraftCommandAdapter";
import { publishedSpeedRestrictionConflict } from "./flightProfileGuidance";
import {
  pilotResponseForSlotConfirmation,
  pilotResponseForValidation,
  type PilotResponse
} from "./pilotResponseLayer";
import type {
  AircraftState,
  LevelRestrictionCancellationPolicy,
  RadarDataset,
  SpeedRestrictionCancellationPolicy
} from "./types";

export interface EvaluateAtcRestrictionCancellationArgs {
  parsed: ParsedAtcCommand;
  targetAircraft: AircraftState;
  dataset: RadarDataset;
}

export type AtcRestrictionCancellationEvaluation =
  | {
      status: "not_supported";
    }
  | {
      status: "response";
      response: PilotResponse;
    }
  | {
      status: "applied";
      response: PilotResponse;
      aircraft: AircraftState;
    };

export function evaluateAtcRestrictionCancellation({
  parsed,
  targetAircraft,
  dataset
}: EvaluateAtcRestrictionCancellationArgs): AtcRestrictionCancellationEvaluation {
  if (parsed.intent === "CANCEL_LEVEL_RESTRICTION") {
    return evaluateLevelRestrictionCancellation(parsed, targetAircraft);
  }

  if (parsed.intent === "CANCEL_SPEED_RESTRICTION") {
    return evaluateSpeedRestrictionCancellation(parsed, targetAircraft, dataset);
  }

  return { status: "not_supported" };
}

function evaluateLevelRestrictionCancellation(
  parsed: ParsedAtcCommand,
  targetAircraft: AircraftState
): AtcRestrictionCancellationEvaluation {
  const policy = parsed.slots.cancel_level_restriction as
    | LevelRestrictionCancellationPolicy
    | undefined;

  if (!policy) {
    return unable(parsed, "missing cancellation policy");
  }

  const effectivePolicy: LevelRestrictionCancellationPolicy =
    policy.scope === "APP_ALL" && targetAircraft.procedure_kind === "STAR"
      ? { scope: "STAR" }
      : policy;
  const result = applyScopedLevelRestrictionCancellation(targetAircraft, effectivePolicy);

  if (result.status === "confirmation_required") {
    return confirm(parsed, result.reason ?? "scope required");
  }

  if (result.status !== "applied") {
    return unable(parsed, result.reason ?? "level restriction cancellation rejected");
  }

  return applied(parsed, result.aircraft, "level restriction cancellation applied");
}

function evaluateSpeedRestrictionCancellation(
  parsed: ParsedAtcCommand,
  targetAircraft: AircraftState,
  dataset: RadarDataset
): AtcRestrictionCancellationEvaluation {
  const policy = parsed.slots.cancel_speed_restriction as
    | SpeedRestrictionCancellationPolicy
    | undefined;

  if (!policy) {
    return unable(parsed, "missing speed restriction cancellation policy");
  }

  const activeConflict = publishedSpeedRestrictionConflict(targetAircraft, dataset);
  const result = applyScopedSpeedRestrictionCancellation(
    targetAircraft,
    policy,
    activeConflict?.fix_id
  );

  if (result.status === "confirmation_required") {
    return confirm(parsed, "missing speed restriction fix scope");
  }

  if (result.status !== "applied") {
    return unable(parsed, result.reason ?? "speed restriction cancellation rejected");
  }

  return applied(parsed, result.aircraft, "speed restriction cancellation applied");
}

function confirm(
  parsed: ParsedAtcCommand,
  detail: string
): AtcRestrictionCancellationEvaluation {
  return {
    status: "response",
    response: pilotResponseForSlotConfirmation(parsed, detail)
  };
}

function unable(
  parsed: ParsedAtcCommand,
  detail: string
): AtcRestrictionCancellationEvaluation {
  return {
    status: "response",
    response: pilotResponseForValidation(parsed, { status: "unable", detail })
  };
}

function applied(
  parsed: ParsedAtcCommand,
  aircraft: AircraftState,
  detail: string
): AtcRestrictionCancellationEvaluation {
  return {
    status: "applied",
    aircraft,
    response: pilotResponseForValidation(parsed, { status: "accepted", detail })
  };
}
