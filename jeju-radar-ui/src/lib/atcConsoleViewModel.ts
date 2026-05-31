import type { PilotResponse, PilotResponsePayload } from "./pilotResponseLayer";
import type { PilotVoiceMode, PilotVoiceSource } from "./pilotVoiceClient";

export const PILOT_VOICE_LLM_LATENCY_BUDGET_MS = 900;
export const PILOT_VOICE_CACHE_LIMIT = 80;

export type AtcConsoleStatus = "idle" | "readback" | "confirm" | "unable" | "say_again" | "silent" | "error";
export type AtcRadioExchangePhase =
  | "none"
  | "pilot_readback_pending"
  | "pilot_readback_received"
  | "pilot_partial_readback_pending"
  | "pilot_partial_readback_received"
  | "pilot_confirmation_pending"
  | "pilot_say_again"
  | "pilot_unable"
  | "no_response";

export interface AtcConsoleResult {
  status: AtcConsoleStatus;
  response: string;
  detail?: string;
  pilot_response?: PilotResponse["payload"];
  voice_source?: PilotVoiceSource;
  llm_response?: string;
  radio_exchange_phase?: AtcRadioExchangePhase;
}

export interface PilotVoiceUiStatus {
  state: "deterministic" | "standby" | "calling" | "openai" | "fallback" | "silent";
  detail: string;
  model?: string;
}

export type PilotVoiceRequestKeyPayload = Pick<
  PilotResponsePayload,
  "callsign" | "condition" | "response_action" | "engine_action" | "speakable_text" | "validation_detail"
>;

export function atcConsoleResultFromPilotResponse(pilotResponse: PilotResponse): AtcConsoleResult {
  return {
    status: pilotResponse.status,
    response: pilotResponse.response,
    detail: pilotResponse.detail,
    pilot_response: pilotResponse.payload,
    voice_source: pilotResponse.payload.response_action === "SILENT_NO_RESPONSE" ? "silent" : "deterministic",
    radio_exchange_phase: radioExchangePhaseForPilotResponse(pilotResponse)
  };
}

export function atcConsoleResultWithPilotVoiceDelivered(
  result: AtcConsoleResult,
  voiceSource: PilotVoiceSource
): AtcConsoleResult {
  return {
    ...result,
    voice_source: voiceSource,
    radio_exchange_phase:
      result.radio_exchange_phase === "pilot_readback_pending"
        ? "pilot_readback_received"
        : result.radio_exchange_phase === "pilot_partial_readback_pending"
          ? "pilot_partial_readback_received"
        : result.radio_exchange_phase
  };
}

export function atcConsoleResultAfterPilotVoicePlayback(
  result: AtcConsoleResult,
  payload: PilotResponsePayload,
  voiceSource: PilotVoiceSource,
  voiceText: string = payload.speakable_text
): AtcConsoleResult {
  if (result.pilot_response !== payload) {
    return result;
  }

  return {
    ...atcConsoleResultWithPilotVoiceDelivered(result, voiceSource),
    response: payload.response_action === "SILENT_NO_RESPONSE" ? result.response : voiceText,
    llm_response: voiceSource === "openai" ? voiceText : undefined
  };
}

export function radioExchangePhaseLabel(phase: AtcRadioExchangePhase | undefined) {
  switch (phase) {
    case "pilot_readback_pending":
      return "RDBK PEND";
    case "pilot_readback_received":
      return "RDBK RCVD";
    case "pilot_partial_readback_pending":
      return "PARTIAL PEND";
    case "pilot_partial_readback_received":
      return "PARTIAL RCVD";
    case "pilot_confirmation_pending":
      return "CONF PEND";
    case "pilot_say_again":
      return "SAY AGAIN";
    case "pilot_unable":
      return "UNABLE";
    case "no_response":
      return "NO RESP";
    case "none":
    case undefined:
      return "";
  }
}

export function radioExchangePhaseBlocksPilotFirstContact(phase: AtcRadioExchangePhase | undefined) {
  return (
    phase === "pilot_readback_pending" ||
    phase === "pilot_partial_readback_pending" ||
    phase === "pilot_confirmation_pending"
  );
}

function radioExchangePhaseForPilotResponse(
  pilotResponse: Pick<PilotResponse, "status" | "payload">
): AtcRadioExchangePhase {
  if (pilotResponse.payload.response_action === "SILENT_NO_RESPONSE" || pilotResponse.status === "silent") {
    return "no_response";
  }

  if (pilotResponse.payload.condition === "PARTIAL_COMMAND_APPLIED") {
    return "pilot_partial_readback_pending";
  }

  if (pilotResponse.payload.response_action === "READBACK" || pilotResponse.status === "readback") {
    return "pilot_readback_pending";
  }

  if (pilotResponse.payload.response_action === "CONFIRM_INTENT" || pilotResponse.payload.response_action === "CONFIRM_CANCEL_SPEED_RESTRICTION" || pilotResponse.status === "confirm") {
    return "pilot_confirmation_pending";
  }

  if (pilotResponse.payload.response_action === "SAY_AGAIN" || pilotResponse.status === "say_again") {
    return "pilot_say_again";
  }

  if (pilotResponse.payload.response_action === "UNABLE" || pilotResponse.status === "unable") {
    return "pilot_unable";
  }

  return "none";
}

export function pilotVoiceRequestKey(pilotVoiceMode: PilotVoiceMode, payload: PilotVoiceRequestKeyPayload): string {
  return [
    pilotVoiceMode,
    payload.callsign ?? "",
    payload.condition,
    payload.response_action,
    payload.engine_action,
    payload.speakable_text,
    payload.validation_detail ?? ""
  ].join("|");
}
