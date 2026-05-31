import {
  atcCommandSummary,
  pilotReadbackForParsedCommand,
  type ParsedAtcCommand
} from "./atcCommandParser";
import type { AtcCommandValidationResult } from "./atcCommandValidation";

export type PilotResponseStatus = "readback" | "confirm" | "unable" | "say_again" | "silent";

export type PilotResponseCondition =
  | "MISSING_CALLSIGN"
  | "UNKNOWN_CALLSIGN"
  | "NO_PATTERN_MATCH_WITH_CALLSIGN"
  | "VALIDATED_COMMAND"
  | "REQUIRES_CONFIRMATION"
  | "PUBLISHED_SPEED_RESTRICTION_CONFLICT_WITHIN_5NM"
  | "INVALID_OR_RULE_CONFLICT"
  | "UNKNOWN_FIX_OR_PROCEDURE"
  | "NO_PENDING_CONFIRMATION"
  | "PENDING_CONFIRMATION_DECLINED"
  | "PENDING_CONFIRMATION_ACCEPTED"
  | "PENDING_CONFIRMATION_UNABLE"
  | "AIRCRAFT_NOT_ON_FREQUENCY"
  | "PILOT_FIRST_CONTACT"
  | "RADIO_JAMMED"
  | "RADIO_CALLSIGN_QUERY"
  | "MISSED_APPROACH_REPORT"
  | "READBACK_ONLY_COMMAND"
  | "PARTIAL_COMMAND_APPLIED";

export type PilotResponseAction =
  | "READBACK"
  | "CONFIRM_INTENT"
  | "CONFIRM_CANCEL_SPEED_RESTRICTION"
  | "UNABLE"
  | "SAY_AGAIN"
  | "SILENT_NO_RESPONSE";

export type PilotEngineAction =
  | "APPLY_AFTER_VALIDATION"
  | "HOLD_PENDING_CONFIRMATION"
  | "NO_STATE_CHANGE"
  | "APPLY_PENDING_CONFIRMATION"
  | "CLEAR_PENDING_CONFIRMATION";

export interface PilotResponsePayload {
  callsign: string | null;
  condition: PilotResponseCondition;
  response_action: PilotResponseAction;
  engine_action: PilotEngineAction;
  speakable_text: string;
  parser_intent?: string | null;
  parser_pattern_id?: string | null;
  validation_detail?: string;
  llm_role: "pilot_readback_voice";
  llm_allowed_actions: Array<"say_text" | "polish_phraseology">;
  llm_forbidden_actions: Array<
    | "mutate_aircraft_state"
    | "invent_clearance"
    | "change_validation_result"
    | "apply_engine_effect"
  >;
}

export interface PilotResponse {
  status: PilotResponseStatus;
  response: string;
  detail?: string;
  payload: PilotResponsePayload;
}

export function pilotResponseForMissingCallsign(): PilotResponse {
  return buildPilotResponse({
    status: "silent",
    condition: "MISSING_CALLSIGN",
    responseAction: "SILENT_NO_RESPONSE",
    engineAction: "NO_STATE_CHANGE",
    callsign: null,
    response: "NO RESPONSE",
    detail: "callsign missing"
  });
}

export function pilotResponseForUnknownCallsign(callsign: string): PilotResponse {
  return buildPilotResponse({
    status: "silent",
    condition: "UNKNOWN_CALLSIGN",
    responseAction: "SILENT_NO_RESPONSE",
    engineAction: "NO_STATE_CHANGE",
    callsign,
    response: "NO RESPONSE",
    detail: `${callsign} not on frequency`
  });
}

export function pilotResponseForAircraftNotOnFrequency(callsign: string): PilotResponse {
  return buildPilotResponse({
    status: "silent",
    condition: "AIRCRAFT_NOT_ON_FREQUENCY",
    responseAction: "SILENT_NO_RESPONSE",
    engineAction: "NO_STATE_CHANGE",
    callsign,
    response: "NO RESPONSE",
    detail: `${callsign} has not checked in`
  });
}

export function pilotResponseForNoPatternMatch(parsed: ParsedAtcCommand): PilotResponse {
  return buildPilotResponse({
    status: "say_again",
    condition: "NO_PATTERN_MATCH_WITH_CALLSIGN",
    responseAction: "SAY_AGAIN",
    engineAction: "NO_STATE_CHANGE",
    parsed,
    response: `${parsed.callsign}, say again.`,
    detail: "no parser match"
  });
}

export function pilotResponseForValidation(
  parsed: ParsedAtcCommand,
  validation: AtcCommandValidationResult
): PilotResponse {
  if (validation.status === "accepted") {
    return buildPilotResponse({
      status: "readback",
      condition: "VALIDATED_COMMAND",
      responseAction: "READBACK",
      engineAction: "APPLY_AFTER_VALIDATION",
      parsed,
      response: pilotReadbackForParsedCommand(parsed),
      detail: validation.detail
    });
  }

  if (validation.status === "say_again") {
    const asksFix = validation.detail.includes("fix");

    return buildPilotResponse({
      status: "say_again",
      condition: asksFix ? "UNKNOWN_FIX_OR_PROCEDURE" : "NO_PATTERN_MATCH_WITH_CALLSIGN",
      responseAction: "SAY_AGAIN",
      engineAction: "NO_STATE_CHANGE",
      parsed,
      response: asksFix ? `${parsed.callsign}, say again fix.` : `${parsed.callsign}, say again.`,
      detail: validation.detail
    });
  }

  if (validation.status === "confirm") {
    const speedConflict = validation.detail.includes("cancel speed restriction");

    return buildPilotResponse({
      status: "confirm",
      condition: speedConflict
        ? "PUBLISHED_SPEED_RESTRICTION_CONFLICT_WITHIN_5NM"
        : "REQUIRES_CONFIRMATION",
      responseAction: speedConflict ? "CONFIRM_CANCEL_SPEED_RESTRICTION" : "CONFIRM_INTENT",
      engineAction: "HOLD_PENDING_CONFIRMATION",
      parsed,
      response: speedConflict
        ? `${parsed.callsign}, confirm cancel speed restriction?`
        : `${parsed.callsign}, confirm ${confirmationInstructionText(parsed)}?`,
      detail: validation.detail
    });
  }

  return buildPilotResponse({
    status: "unable",
    condition: "INVALID_OR_RULE_CONFLICT",
    responseAction: "UNABLE",
    engineAction: "NO_STATE_CHANGE",
    parsed,
    response: `${parsed.callsign}, unable.`,
    detail: validation.detail
  });
}

export function pilotResponseForSlotConfirmation(parsed: ParsedAtcCommand, detail: string): PilotResponse {
  return buildPilotResponse({
    status: "confirm",
    condition: "REQUIRES_CONFIRMATION",
    responseAction: "CONFIRM_INTENT",
    engineAction: "HOLD_PENDING_CONFIRMATION",
    parsed,
    response: `${parsed.callsign}, confirm ${confirmationInstructionText(parsed)}?`,
    detail
  });
}

function confirmationInstructionText(parsed: ParsedAtcCommand) {
  const summary = atcCommandSummary(parsed);

  return summary.length > 0 ? `${summary[0].toLowerCase()}${summary.slice(1)}` : summary;
}

export function pilotResponseForSpeedRestrictionConflict(
  callsign: string,
  detail: string
): PilotResponse {
  return buildPilotResponse({
    status: "confirm",
    condition: "PUBLISHED_SPEED_RESTRICTION_CONFLICT_WITHIN_5NM",
    responseAction: "CONFIRM_CANCEL_SPEED_RESTRICTION",
    engineAction: "HOLD_PENDING_CONFIRMATION",
    callsign,
    response: `${callsign}, confirm cancel speed restriction?`,
    detail
  });
}

export function pilotResponseForPendingConfirmationMissing(): PilotResponse {
  return buildPilotResponse({
    status: "say_again",
    condition: "NO_PENDING_CONFIRMATION",
    responseAction: "SAY_AGAIN",
    engineAction: "NO_STATE_CHANGE",
    callsign: null,
    response: "NO PENDING CONFIRMATION",
    detail: "affirm/negative received without pending confirmation"
  });
}

export function pilotResponseForPendingConfirmationDeclined(callsign: string): PilotResponse {
  return buildPilotResponse({
    status: "readback",
    condition: "PENDING_CONFIRMATION_DECLINED",
    responseAction: "READBACK",
    engineAction: "CLEAR_PENDING_CONFIRMATION",
    callsign,
    response: `${callsign}, roger.`,
    detail: "confirmation declined; no aircraft state change"
  });
}

export function pilotResponseForPendingConfirmationUnable(
  callsign: string,
  detail: string
): PilotResponse {
  return buildPilotResponse({
    status: "unable",
    condition: "PENDING_CONFIRMATION_UNABLE",
    responseAction: "UNABLE",
    engineAction: "NO_STATE_CHANGE",
    callsign,
    response: `${callsign}, unable.`,
    detail
  });
}

export function pilotResponseForPendingConfirmationAccepted(
  callsign: string,
  readback: string,
  detail: string
): PilotResponse {
  return buildPilotResponse({
    status: "readback",
    condition: "PENDING_CONFIRMATION_ACCEPTED",
    responseAction: "READBACK",
    engineAction: "APPLY_PENDING_CONFIRMATION",
    callsign,
    response: readback,
    detail
  });
}

export function pilotResponseForMultiCommandAccepted(
  callsign: string,
  readback: string,
  detail: string
): PilotResponse {
  return buildPilotResponse({
    status: "readback",
    condition: "VALIDATED_COMMAND",
    responseAction: "READBACK",
    engineAction: "APPLY_AFTER_VALIDATION",
    callsign,
    response: readback,
    detail,
    parserIntent: "MULTI_COMMAND",
    parserPatternId: "multi_command_batch"
  });
}

export function pilotResponseForMultiCommandRejected(callsign: string, detail: string): PilotResponse {
  return buildPilotResponse({
    status: "say_again",
    condition: "NO_PATTERN_MATCH_WITH_CALLSIGN",
    responseAction: "SAY_AGAIN",
    engineAction: "NO_STATE_CHANGE",
    callsign,
    response: `${callsign}, say again separately.`,
    detail,
    parserIntent: "MULTI_COMMAND",
    parserPatternId: "multi_command_batch"
  });
}

export function pilotResponseForPartialCommandAccepted(
  callsign: string,
  readback: string,
  detail: string
): PilotResponse {
  return buildPilotResponse({
    status: "readback",
    condition: "PARTIAL_COMMAND_APPLIED",
    responseAction: "READBACK",
    engineAction: "APPLY_AFTER_VALIDATION",
    callsign,
    response: readback,
    detail,
    parserIntent: "PARTIAL_MULTI_COMMAND",
    parserPatternId: "partial_multi_command_batch"
  });
}

export function pilotResponseForReadbackOnlyCommand(
  parsed: ParsedAtcCommand,
  detail: string
): PilotResponse {
  return buildPilotResponse({
    status: "readback",
    condition: "READBACK_ONLY_COMMAND",
    responseAction: "READBACK",
    engineAction: "NO_STATE_CHANGE",
    parsed,
    response: pilotReadbackForParsedCommand(parsed),
    detail
  });
}

export function pilotResponseForFirstContact(
  callsign: string,
  response: string,
  detail: string
): PilotResponse {
  return buildPilotResponse({
    status: "readback",
    condition: "PILOT_FIRST_CONTACT",
    responseAction: "READBACK",
    engineAction: "NO_STATE_CHANGE",
    callsign,
    response,
    detail,
    parserIntent: "PILOT_FIRST_CONTACT",
    parserPatternId: "pilot_first_contact"
  });
}

export function pilotResponseForRadioJamming(
  response: string,
  detail: string
): PilotResponse {
  return buildPilotResponse({
    status: "say_again",
    condition: "RADIO_JAMMED",
    responseAction: "SAY_AGAIN",
    engineAction: "NO_STATE_CHANGE",
    callsign: null,
    response,
    detail,
    parserIntent: "RADIO_JAMMED",
    parserPatternId: "simultaneous_pilot_transmission"
  });
}

export function pilotResponseForRadioCallsignQuery(
  callsign: string,
  detail: string
): PilotResponse {
  return buildPilotResponse({
    status: "readback",
    condition: "RADIO_CALLSIGN_QUERY",
    responseAction: "READBACK",
    engineAction: "NO_STATE_CHANGE",
    callsign,
    response: callsign,
    detail,
    parserIntent: "CONFIRM_CALLSIGN",
    parserPatternId: "confirm_callsign"
  });
}

export function pilotResponseForMissedApproachReport(
  callsign: string,
  response: string,
  detail: string
): PilotResponse {
  return buildPilotResponse({
    status: "readback",
    condition: "MISSED_APPROACH_REPORT",
    responseAction: "READBACK",
    engineAction: "NO_STATE_CHANGE",
    callsign,
    response,
    detail,
    parserIntent: "MISSED_APPROACH_REPORT",
    parserPatternId: "tower_missed_approach_event"
  });
}

function buildPilotResponse(args: {
  status: PilotResponseStatus;
  condition: PilotResponseCondition;
  responseAction: PilotResponseAction;
  engineAction: PilotEngineAction;
  response: string;
  detail?: string;
  callsign?: string | null;
  parsed?: ParsedAtcCommand;
  parserIntent?: string;
  parserPatternId?: string;
}): PilotResponse {
  const callsign = args.callsign ?? args.parsed?.callsign ?? null;

  return {
    status: args.status,
    response: args.response,
    detail: args.detail,
    payload: {
      callsign,
      condition: args.condition,
      response_action: args.responseAction,
      engine_action: args.engineAction,
      speakable_text: args.response,
      parser_intent: args.parserIntent ?? args.parsed?.intent,
      parser_pattern_id: args.parserPatternId ?? args.parsed?.pattern_id,
      validation_detail: args.detail,
      llm_role: "pilot_readback_voice",
      llm_allowed_actions: ["say_text", "polish_phraseology"],
      llm_forbidden_actions: [
        "mutate_aircraft_state",
        "invent_clearance",
        "change_validation_result",
        "apply_engine_effect"
      ]
    }
  };
}
