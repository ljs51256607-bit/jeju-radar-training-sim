import { aircraftWithControllerSpeedPolicy } from "./aircraftCommandTransitions";
import { applyScopedSpeedRestrictionCancellation } from "./aircraftCommandAdapter";
import type { AtcSpeedRestrictionConfirmationDraft } from "./atcCommandSingleRuntime";
import {
  pilotResponseForPendingConfirmationAccepted,
  pilotResponseForPendingConfirmationDeclined,
  pilotResponseForPendingConfirmationMissing,
  pilotResponseForPendingConfirmationUnable,
  type PilotResponse
} from "./pilotResponseLayer";
import type { AircraftState } from "./types";

export type PendingAtcConfirmation =
  | AtcSpeedRestrictionConfirmationDraft
  | {
      kind: "cancel_active_speed_restriction";
      aircraftId: string;
      callsign: string;
      fixId: string;
      readback: string;
    };

export interface EvaluatePendingAtcConfirmationArgs {
  pending: PendingAtcConfirmation | null;
  affirmed: boolean;
  aircraftTraffic: AircraftState[];
}

export type PendingAtcConfirmationEvaluation =
  | {
      status: "response";
      response: PilotResponse;
    }
  | {
      status: "applied";
      aircraftId: string;
      aircraft: AircraftState;
      response: PilotResponse;
    };

export function evaluatePendingAtcConfirmation({
  pending,
  affirmed,
  aircraftTraffic
}: EvaluatePendingAtcConfirmationArgs): PendingAtcConfirmationEvaluation {
  if (!pending) {
    return {
      status: "response",
      response: pilotResponseForPendingConfirmationMissing()
    };
  }

  if (!affirmed) {
    return {
      status: "response",
      response: pilotResponseForPendingConfirmationDeclined(pending.callsign)
    };
  }

  const targetAircraft = aircraftTraffic.find((aircraft) => aircraft.id === pending.aircraftId);

  if (!targetAircraft) {
    return {
      status: "response",
      response: pilotResponseForPendingConfirmationUnable(
        pending.callsign,
        "pending aircraft no longer exists"
      )
    };
  }

  const result = applyScopedSpeedRestrictionCancellation(
    targetAircraft,
    { scope: "FIX", fix_id: pending.fixId },
    pending.fixId
  );

  if (result.status !== "applied") {
    return {
      status: "response",
      response: pilotResponseForPendingConfirmationUnable(
        pending.callsign,
        result.reason ?? "pending confirmation could not be applied"
      )
    };
  }

  const aircraft =
    pending.kind === "cancel_speed_restriction_for_speed_command"
      ? aircraftWithControllerSpeedPolicy(result.aircraft, pending.speedPolicy, pending.activeAtMs)
      : result.aircraft;

  return {
    status: "applied",
    aircraftId: pending.aircraftId,
    aircraft,
    response: pilotResponseForPendingConfirmationAccepted(
      pending.callsign,
      pending.readback,
      `affirm received; ${pending.fixId} speed restriction cancelled`
    )
  };
}
