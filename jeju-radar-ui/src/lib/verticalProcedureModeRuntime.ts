import {
  formatPanelAltitude,
  type AircraftControlForm
} from "./aircraftControlPanel";
import {
  activeProcedureScratchpadToken,
  mergeProcedureScratchpad
} from "./aircraftInteraction";
import { procedureScratchpadToken } from "./procedureRouteUtils";
import type {
  AircraftState,
  AircraftVerticalProcedureMode,
  ProcedureRecord
} from "./types";

export type VerticalProcedureModeCommand = Extract<
  AircraftVerticalProcedureMode,
  "des_via" | "cancel_level"
>;

export interface BuildVerticalProcedureModeDraftArgs {
  selectedAircraftId: string | null;
  aircraftTraffic: AircraftState[];
  stars: ProcedureRecord[];
  mode: VerticalProcedureModeCommand;
}

export type VerticalProcedureModeDraftResult =
  | {
      status: "noop";
    }
  | {
      status: "error";
      message: string;
    }
  | {
      status: "created";
      aircraftId: string;
      aircraft: AircraftState;
      controlUpdates: Partial<AircraftControlForm>;
    };

export function buildVerticalProcedureModeDraft({
  selectedAircraftId,
  aircraftTraffic,
  stars,
  mode
}: BuildVerticalProcedureModeDraftArgs): VerticalProcedureModeDraftResult {
  if (!selectedAircraftId) {
    return { status: "noop" };
  }

  const selectedAircraft = aircraftTraffic.find((aircraft) => aircraft.id === selectedAircraftId);

  if (!selectedAircraft || selectedAircraft.flight_phase !== "arrival") {
    return { status: "error", message: "APP 항공기에만 적용 가능" };
  }

  const aircraft = aircraftWithVerticalProcedureMode(selectedAircraft, stars, mode);

  return {
    status: "created",
    aircraftId: selectedAircraftId,
    aircraft,
    controlUpdates: verticalProcedureModeControlUpdates(aircraft, mode)
  };
}

export function aircraftWithVerticalProcedureMode(
  aircraft: AircraftState,
  stars: ProcedureRecord[],
  mode: VerticalProcedureModeCommand
): AircraftState {
  return {
    ...aircraft,
    altitude_control_mode: "controller",
    vertical_rate_control_mode: "controller",
    vertical_procedure_mode: mode,
    managed_altitude_constraint_fix: undefined,
    managed_altitude_constraint_ft: undefined,
    managed_vertical_rate_fpm: undefined,
    pending_descent_altitude_ft: undefined,
    execution_altitude_ft: undefined,
    execution_vertical_rate_fpm: undefined,
    star_via_clearance_altitude_ft: undefined,
    ...starScratchpadUpdateForMode(aircraft, stars, mode)
  };
}

function verticalProcedureModeControlUpdates(
  aircraft: AircraftState,
  mode: VerticalProcedureModeCommand
): Partial<AircraftControlForm> {
  const updates: Partial<AircraftControlForm> = {
    ...(mode === "cancel_level"
      ? {
          altitude: formatPanelAltitude(aircraft.assigned?.altitude_ft ?? aircraft.altitude_ft),
          verticalRate: "0"
        }
      : {})
  };

  if (typeof aircraft.scratchpad === "string") {
    updates.scratchpad = aircraft.scratchpad;
  }

  return updates;
}

function starScratchpadUpdateForMode(
  aircraft: AircraftState,
  stars: ProcedureRecord[],
  mode: VerticalProcedureModeCommand
) {
  if (aircraft.procedure_kind !== "STAR" || !aircraft.procedure_id) {
    return {};
  }

  const starProcedure = stars.find((procedure) => procedure.id === aircraft.procedure_id);

  if (!starProcedure) {
    return {};
  }

  const previousProcedureToken = activeProcedureScratchpadToken(aircraft);
  const nextProcedureToken = procedureScratchpadToken("STAR", starProcedure, mode);

  return {
    scratchpad: mergeProcedureScratchpad(
      aircraft.scratchpad ?? "",
      previousProcedureToken,
      nextProcedureToken
    ),
    scratchpad_auto_procedure_token: nextProcedureToken
  };
}
