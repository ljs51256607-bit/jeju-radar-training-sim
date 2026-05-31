import { initialBearingTrueDeg } from "./aircraftMotion";
import {
  activeDirectScratchpadToken,
  activeProcedureScratchpadToken,
  mergeProcedureScratchpad,
  procedureSelectionUsesManagedAltitude
} from "./aircraftInteraction";
import type { ProcedureKind } from "./procedureRouteUtils";
import { procedureScratchpadToken } from "./procedureRouteUtils";
import type {
  AircraftState,
  AircraftVerticalProcedureMode,
  ProcedureRecord
} from "./types";

interface AircraftWithProcedureCommandArgs {
  aircraft: AircraftState;
  kind: ProcedureKind;
  procedure: ProcedureRecord;
  route: string[];
  procedureRouteIndex: number;
  firstFix: {
    latitude: number;
    longitude: number;
  };
  verticalProcedureMode: AircraftVerticalProcedureMode;
  guidanceActiveAtMs: number | undefined;
}

export function aircraftWithProcedureCommand({
  aircraft,
  kind,
  procedure,
  route,
  procedureRouteIndex,
  firstFix,
  verticalProcedureMode,
  guidanceActiveAtMs
}: AircraftWithProcedureCommandArgs): AircraftState {
  const firstFixId = route[procedureRouteIndex];
  const procedureToken = procedureScratchpadToken(kind, procedure, verticalProcedureMode);
  const managedVertical = procedureSelectionUsesManagedAltitude(kind, verticalProcedureMode);
  const headingTrue = initialBearingTrueDeg(
    aircraft.latitude,
    aircraft.longitude,
    firstFix.latitude,
    firstFix.longitude
  );
  const directToken = aircraft.scratchpad_auto_direct_token ?? activeDirectScratchpadToken(aircraft);
  const previousProcedureToken = activeProcedureScratchpadToken(aircraft);
  const scratchpadBase = aircraft.scratchpad ?? "";

  return {
    ...aircraft,
    route_mode: "procedure",
    next_fix: firstFixId,
    procedure_id: procedure.id,
    procedure_name: procedure.name,
    procedure_kind: kind,
    procedure_route: route,
    procedure_route_index: procedureRouteIndex,
    approach_phase: kind === "APP" ? "initial" : undefined,
    landing_state: undefined,
    landed_at_ms: undefined,
    altitude_control_mode: managedVertical ? "managed" : "controller",
    vertical_rate_control_mode: managedVertical ? "managed" : "controller",
    vertical_procedure_mode: verticalProcedureMode,
    star_via_clearance_altitude_ft: undefined,
    managed_altitude_constraint_fix: undefined,
    managed_altitude_constraint_ft: undefined,
    managed_vertical_rate_fpm: undefined,
    pending_descent_altitude_ft: undefined,
    execution_heading_true_deg: headingTrue,
    execution_speed_kt: undefined,
    execution_altitude_ft: undefined,
    execution_vertical_rate_fpm: undefined,
    managed_speed_kt: undefined,
    guidance_active_at_ms: guidanceActiveAtMs,
    heading_active_at_ms: guidanceActiveAtMs,
    scratchpad: mergeProcedureScratchpad(scratchpadBase, previousProcedureToken, procedureToken),
    scratchpad_auto_direct_token: directToken,
    scratchpad_auto_procedure_token: procedureToken,
    assigned: {
      ...aircraft.assigned
    }
  };
}
