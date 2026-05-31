import {
  pilotReadbackForParsedCommand,
  type ParsedAtcCommand
} from "./atcCommandParser";
import { parsedCommandWithHoldReadbackContext } from "./atcHoldReadbackContext";
import {
  acceptedAtcCommandIntentIsSupported,
  applyAcceptedAtcCommandToAircraft,
  speedPolicyFromParsedCommand,
  type AtcCommandControlUpdates
} from "./atcCommandApplication";
import { validateAtcCommand } from "./atcCommandValidation";
import { slotRequiresConfirmation } from "./atcCommandBatchRuntime";
import { aircraftAcceptsAtcCommands } from "./aircraftFrequency";
import { publishedSpeedRestrictionConflict } from "./flightProfileGuidance";
import { evaluateAtcProcedureCommand } from "./atcProcedureCommandRuntime";
import { evaluateAtcRestrictionCancellation } from "./atcRestrictionCancellationRuntime";
import {
  pilotResponseForAircraftNotOnFrequency,
  pilotResponseForMissingCallsign,
  pilotResponseForNoPatternMatch,
  pilotResponseForReadbackOnlyCommand,
  pilotResponseForSlotConfirmation,
  pilotResponseForUnknownCallsign,
  pilotResponseForValidation,
  type PilotResponse
} from "./pilotResponseLayer";
import type { ProcedureAssignmentDraft } from "./procedureAssignmentRuntime";
import { sanitizeCallsignInput } from "./scenarioTraffic";
import type {
  AircraftControllerSpeedPolicy,
  AircraftState,
  RadarDataset
} from "./types";

export interface ResolveAtcSingleCommandTargetArgs {
  parsed: ParsedAtcCommand;
  aircraftTraffic: AircraftState[];
}

export type AtcSingleCommandTargetResolution =
  | {
      status: "response";
      response: PilotResponse;
      targetAircraftId?: string;
      markOnFrequencyAircraftId?: string;
    }
  | {
      status: "ready";
      parsed: ParsedAtcCommand;
      targetAircraft: AircraftState;
      targetAircraftId: string;
      markOnFrequencyAircraftId: string;
    };

export interface AtcSpeedRestrictionConfirmationDraft {
  kind: "cancel_speed_restriction_for_speed_command";
  aircraftId: string;
  callsign: string;
  fixId: string;
  speedPolicy: AircraftControllerSpeedPolicy;
  activeAtMs: number;
  readback: string;
}

export interface EvaluateAtcSingleCommandValidationArgs {
  parsed: ParsedAtcCommand;
  targetAircraft: AircraftState;
  dataset: RadarDataset;
  commandActiveAtMs: number;
}

export type AtcSingleCommandValidationEvaluation =
  | {
      status: "continue";
    }
  | {
      status: "response";
      response: PilotResponse;
      pendingConfirmation?: AtcSpeedRestrictionConfirmationDraft;
    };

export interface EvaluateAcceptedAtcSingleCommandApplicationArgs {
  parsed: ParsedAtcCommand;
  targetAircraft: AircraftState;
  dataset: RadarDataset;
  magneticVariationWestDeg: number;
  commandActiveAtMs: number | undefined;
}

export type AcceptedAtcSingleCommandApplicationEvaluation =
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
      controlUpdates: AtcCommandControlUpdates;
    };

export interface EvaluateReadyAtcSingleCommandArgs {
  parsed: ParsedAtcCommand;
  targetAircraft: AircraftState;
  dataset: RadarDataset;
  magneticVariationWestDeg: number;
  commandActiveAtMs: number;
  issuedAtMs: number;
}

export type ReadyAtcSingleCommandEvaluation =
  | {
      status: "response";
      response: PilotResponse;
      pendingConfirmation?: AtcSpeedRestrictionConfirmationDraft;
      controlErrorMessage?: string;
    }
  | {
      status: "applied";
      response: PilotResponse;
      aircraft: AircraftState;
      controlUpdates?: AtcCommandControlUpdates;
      procedureDraft?: ProcedureAssignmentDraft;
    };

export function resolveAtcSingleCommandTarget({
  parsed,
  aircraftTraffic
}: ResolveAtcSingleCommandTargetArgs): AtcSingleCommandTargetResolution {
  if (!parsed.callsign) {
    return { status: "response", response: pilotResponseForMissingCallsign() };
  }

  const targetAircraft = aircraftTraffic.find(
    (aircraft) => sanitizeCallsignInput(aircraft.callsign) === parsed.callsign
  );

  if (!targetAircraft) {
    return {
      status: "response",
      response: pilotResponseForUnknownCallsign(parsed.callsign)
    };
  }

  if (!aircraftAcceptsAtcCommands(targetAircraft, parsed)) {
    return {
      status: "response",
      targetAircraftId: targetAircraft.id,
      response: pilotResponseForAircraftNotOnFrequency(parsed.callsign)
    };
  }

  if (!parsed.ok || !parsed.intent) {
    return {
      status: "response",
      targetAircraftId: targetAircraft.id,
      markOnFrequencyAircraftId: targetAircraft.id,
      response: pilotResponseForNoPatternMatch(parsed)
    };
  }

  return {
    status: "ready",
    parsed,
    targetAircraft,
    targetAircraftId: targetAircraft.id,
    markOnFrequencyAircraftId: targetAircraft.id
  };
}

export function evaluateAtcSingleCommandValidation({
  parsed,
  targetAircraft,
  dataset,
  commandActiveAtMs
}: EvaluateAtcSingleCommandValidationArgs): AtcSingleCommandValidationEvaluation {
  const validation = validateAtcCommand(parsed, targetAircraft, dataset);

  if (validation.status === "say_again" || validation.status === "unable") {
    return {
      status: "response",
      response: pilotResponseForValidation(parsed, validation)
    };
  }

  if (validation.status === "confirm") {
    if (validation.detail.includes("cancel speed restriction")) {
      const speedPolicy = speedPolicyFromParsedCommand(parsed, dataset);
      const conflict = speedPolicy
        ? publishedSpeedRestrictionConflict(targetAircraft, dataset, speedPolicy)
        : null;

      return {
        status: "response",
        response: pilotResponseForValidation(parsed, validation),
        pendingConfirmation:
          speedPolicy && conflict
            ? {
                kind: "cancel_speed_restriction_for_speed_command",
                aircraftId: targetAircraft.id,
                callsign: parsed.callsign ?? "",
                fixId: conflict.fix_id,
                speedPolicy,
                activeAtMs: commandActiveAtMs,
                readback: pilotReadbackForParsedCommand(parsed)
              }
            : undefined
      };
    }

    return {
      status: "response",
      response: pilotResponseForSlotConfirmation(parsed, validation.detail)
    };
  }

  if (slotRequiresConfirmation(parsed)) {
    return {
      status: "response",
      response: pilotResponseForSlotConfirmation(
        parsed,
        "confirmation required before engine state change"
      )
    };
  }

  return { status: "continue" };
}

export function acceptedAtcCommandAppliedDetail(
  parsed: ParsedAtcCommand,
  controlUpdates: Record<string, unknown>
) {
  if (parsed.intent === "MAINTAIN_PRESENT_HEADING") {
    return "present heading command applied";
  }

  if (parsed.intent === "ONE_CIRCLE_HEADING") {
    return "one-circle heading command applied";
  }

  if (parsed.intent === "ASSIGN_HEADING") {
    return "heading command applied";
  }

  if (
    parsed.intent === "ASSIGN_SPEED" ||
    parsed.intent === "SPEED_UNTIL_FIX" ||
    parsed.intent === "SPEED_UNTIL_FIX_THEN_NORMAL" ||
    parsed.intent === "MAXIMUM_FORWARD_SPEED" ||
    parsed.intent === "MINIMUM_SPEED" ||
    parsed.intent === "MAINTAIN_SPEED_LIMIT" ||
    parsed.intent === "MAINTAIN_SPEED_UNTIL"
  ) {
    return "speed command applied";
  }

  if (parsed.intent === "ASSIGN_ALTITUDE") {
    return "altitude command applied";
  }

  if (parsed.intent === "ASSIGN_VERTICAL_SPEED") {
    return "vertical speed command applied";
  }

  if (parsed.intent === "INCREASE_DESCENT_RATE") {
    return "increase descent rate mode applied";
  }

  if (parsed.intent === "INCREASE_CLIMB_RATE") {
    return "increase climb rate mode applied";
  }

  if (parsed.intent === "RESUME_NORMAL_SPEED") {
    return "normal speed resumed";
  }

  if (parsed.intent === "RESUME_NORMAL_CLIMB") {
    return "normal climb resumed";
  }

  if (parsed.intent === "RESUME_NORMAL_DESCENT") {
    return "normal descent resumed";
  }

  if (parsed.intent === "DIRECT_TO_FIX" || parsed.intent === "TURN_DIRECT_FIX") {
    return typeof controlUpdates.altitude === "string"
      ? "direct-to-fix vector, altitude command applied; procedure cancelled"
      : "direct-to-fix vector applied; procedure cancelled";
  }

  if (parsed.intent === "CROSS_FIX_RESTRICTION") {
    return "crossing restriction applied";
  }

  if (parsed.intent === "EXPEDITE_DESCENT") {
    return "expedite descent mode applied";
  }

  if (parsed.intent === "EXPEDITE_CLIMB") {
    return "expedite climb mode applied";
  }

  if (parsed.intent === "HOLD_AT_FIX") {
    return "holding command applied";
  }

  return "command accepted";
}

export function evaluateAcceptedAtcSingleCommandApplication({
  parsed,
  targetAircraft,
  dataset,
  magneticVariationWestDeg,
  commandActiveAtMs
}: EvaluateAcceptedAtcSingleCommandApplicationArgs): AcceptedAtcSingleCommandApplicationEvaluation {
  if (!acceptedAtcCommandIntentIsSupported(parsed)) {
    return { status: "not_supported" };
  }

  const result = applyAcceptedAtcCommandToAircraft({
    aircraft: targetAircraft,
    parsed,
    dataset,
    magneticVariationWestDeg,
    activeAtMs: commandActiveAtMs
  });

  if (result.status !== "applied") {
    return {
      status: "response",
      response: pilotResponseForValidation(parsed, {
        status: "unable",
        detail: result.detail
      })
    };
  }

  const responseParsed = parsedCommandWithHoldReadbackContext(
    parsed,
    targetAircraft,
    magneticVariationWestDeg
  );

  return {
    status: "applied",
    aircraft: result.aircraft,
    controlUpdates: result.controlUpdates,
    response: pilotResponseForValidation(responseParsed, {
      status: "accepted",
      detail: acceptedAtcCommandAppliedDetail(parsed, result.controlUpdates)
    })
  };
}

export function evaluateReadyAtcSingleCommand({
  parsed,
  targetAircraft,
  dataset,
  magneticVariationWestDeg,
  commandActiveAtMs,
  issuedAtMs
}: EvaluateReadyAtcSingleCommandArgs): ReadyAtcSingleCommandEvaluation {
  const validationEvaluation = evaluateAtcSingleCommandValidation({
    parsed,
    targetAircraft,
    dataset,
    commandActiveAtMs
  });

  if (validationEvaluation.status === "response") {
    return validationEvaluation;
  }

  if (atcCommandIsReadbackOnly(parsed)) {
    return {
      status: "response",
      response: pilotResponseForReadbackOnlyCommand(parsed, "readback-only command accepted")
    };
  }

  const acceptedApplication = evaluateAcceptedAtcSingleCommandApplication({
    parsed,
    targetAircraft,
    dataset,
    magneticVariationWestDeg,
    commandActiveAtMs
  });

  if (acceptedApplication.status === "response") {
    return {
      status: "response",
      response: acceptedApplication.response
    };
  }

  if (acceptedApplication.status === "applied") {
    return {
      status: "applied",
      response: acceptedApplication.response,
      aircraft: acceptedApplication.aircraft,
      controlUpdates: acceptedApplication.controlUpdates
    };
  }

  const procedureCommand = evaluateAtcProcedureCommand({
    parsed,
    targetAircraft,
    dataset,
    commandActiveAtMs,
    issuedAtMs
  });

  if (procedureCommand.status === "response") {
    return {
      status: "response",
      response: procedureCommand.response,
      controlErrorMessage: procedureCommand.controlErrorMessage
    };
  }

  if (procedureCommand.status === "applied") {
    return {
      status: "applied",
      response: procedureCommand.response,
      aircraft: procedureCommand.aircraft,
      procedureDraft: procedureCommand.procedureDraft
    };
  }

  const restrictionCancellation = evaluateAtcRestrictionCancellation({
    parsed,
    targetAircraft,
    dataset
  });

  if (restrictionCancellation.status === "response") {
    return {
      status: "response",
      response: restrictionCancellation.response
    };
  }

  if (restrictionCancellation.status === "applied") {
    return {
      status: "applied",
      response: restrictionCancellation.response,
      aircraft: restrictionCancellation.aircraft
    };
  }

  return {
    status: "response",
    response: pilotResponseForValidation(parsed, {
      status: "unable",
      detail: "intent parsed but engine adapter is not implemented yet"
    })
  };
}

function atcCommandIsReadbackOnly(parsed: ParsedAtcCommand) {
  return (
    parsed.intent === "TRAFFIC_INFORMATION" ||
    parsed.intent === "ASK_INTENTIONS" ||
    parsed.intent === "SEQUENCE_NUMBER" ||
    parsed.intent === "CONFIRM_CALLSIGN" ||
    parsed.intent === "FIRST_CONTACT_ACK" ||
    parsed.intent === "RADIO_STANDBY" ||
    parsed.intent === "CONTACT_FREQUENCY"
  );
}
