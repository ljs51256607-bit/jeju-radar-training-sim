import {
  commandKindForControlField,
  formatHeading,
  formatPanelAltitude,
  magneticToTrueHeading,
  parseAltitudeInput,
  parseHeadingInput,
  parseMagneticVariationWestDeg,
  parseSpeedInput,
  parseVerticalRateInput,
  type AircraftControlField,
  type AircraftControlForm
} from "./aircraftControlPanel";
import {
  activeDirectScratchpadToken,
  activeGuidanceScratchpadTokens,
  activeProcedureScratchpadToken,
  removeScratchpadTokens,
  scratchpadContainsToken
} from "./aircraftInteraction";
import { normalizeScratchpadText } from "./scenarioTraffic";
import { commandActivationTimeMs } from "./simulationTickRuntime";
import type { AircraftState, RadarDataset } from "./types";

export interface BuildAircraftControlCommandDraftArgs {
  commandField: AircraftControlField;
  controlForm: AircraftControlForm;
  formOverride: Partial<AircraftControlForm>;
  targetAircraftId: string;
  aircraftTraffic: AircraftState[];
  dataset: RadarDataset | null;
  issuedAtMs: number;
}

export interface AircraftControlCommandDraft {
  status: "created";
  targetAircraftId: string;
  commandField: AircraftControlField;
  headingMag: number | null;
  headingTrue: number | null;
  speed: number | null;
  altitude: number | null;
  verticalRate: number | null;
  scratchpad: string | null;
  commandActiveAtMs: number | undefined;
  selectedGuidanceTokens: string[];
  shouldClearControlScratchpad: boolean;
}

export type AircraftControlCommandDraftResult =
  | AircraftControlCommandDraft
  | { status: "error"; message: string };

export function buildAircraftControlCommandDraft({
  commandField,
  controlForm,
  formOverride,
  targetAircraftId,
  aircraftTraffic,
  dataset,
  issuedAtMs
}: BuildAircraftControlCommandDraftArgs): AircraftControlCommandDraftResult {
  const commandForm = {
    ...controlForm,
    ...formOverride
  };
  const headingMag = commandField === "heading" ? parseHeadingInput(commandForm.heading) : null;
  const speed = commandField === "speed" ? parseSpeedInput(commandForm.speed) : null;
  const altitude = commandField === "altitude" ? parseAltitudeInput(commandForm.altitude) : null;
  const verticalRate =
    commandField === "verticalRate" ? parseVerticalRateInput(commandForm.verticalRate) : null;
  const scratchpad =
    commandField === "scratchpad" ? normalizeScratchpadText(commandForm.scratchpad) : null;

  if (commandField === "heading" && headingMag === null) {
    return { status: "error", message: "HDG는 2-3자리 숫자: 35=350, 02=020, 215=215" };
  }

  if (commandField === "speed" && speed === null) {
    return { status: "error", message: "SPD는 2-3자리 숫자: 18=180, 25=250, 185=185" };
  }

  if (commandField === "altitude" && altitude === null) {
    return { status: "error", message: "ALT는 A080, F180, 8000, 080 형식" };
  }

  if (commandField === "verticalRate" && verticalRate === null) {
    return { status: "error", message: "VS는 -6000~6000 숫자로 입력" };
  }

  const magneticVariationWestDeg = dataset
    ? parseMagneticVariationWestDeg(dataset.airport.airport_meta.mag_var)
    : 0;
  const headingTrue =
    commandField === "heading" && headingMag !== null
      ? magneticToTrueHeading(headingMag, magneticVariationWestDeg)
      : null;
  const commandKind = commandKindForControlField(commandField);
  const commandActiveAtMs = commandKind
    ? commandActivationTimeMs(dataset, commandKind, issuedAtMs)
    : undefined;
  const selectedAircraftForCommand = aircraftTraffic.find(
    (aircraft) => aircraft.id === targetAircraftId
  );
  const selectedGuidanceTokens = selectedAircraftForCommand
    ? activeGuidanceScratchpadTokens(selectedAircraftForCommand)
    : [];
  const shouldClearControlScratchpad =
    commandField === "heading" &&
    selectedGuidanceTokens.some((token) =>
      scratchpadContainsToken(selectedAircraftForCommand?.scratchpad ?? "", token)
    );

  return {
    status: "created",
    targetAircraftId,
    commandField,
    headingMag,
    headingTrue,
    speed,
    altitude,
    verticalRate,
    scratchpad,
    commandActiveAtMs,
    selectedGuidanceTokens,
    shouldClearControlScratchpad
  };
}

export function applyAircraftControlCommandDraftToAircraft(
  aircraft: AircraftState,
  draft: AircraftControlCommandDraft
): AircraftState {
  if (aircraft.id !== draft.targetAircraftId) {
    return aircraft;
  }

  const assigned = { ...aircraft.assigned };
  const updatedAircraft: AircraftState = { ...aircraft, assigned };

  if (draft.commandField === "heading" && draft.headingTrue !== null) {
    const guidanceTokens = activeGuidanceScratchpadTokens(aircraft);
    const shouldClearGuidanceScratchpad = guidanceTokens.some((token) =>
      scratchpadContainsToken(aircraft.scratchpad ?? "", token)
    );

    updatedAircraft.route_mode = "vector";
    updatedAircraft.next_fix = undefined;
    updatedAircraft.procedure_id = undefined;
    updatedAircraft.procedure_name = undefined;
    updatedAircraft.procedure_kind = undefined;
    updatedAircraft.procedure_route = undefined;
    updatedAircraft.procedure_route_index = undefined;
    updatedAircraft.vertical_procedure_mode = "controller";
    updatedAircraft.star_via_clearance_altitude_ft = undefined;
    updatedAircraft.managed_altitude_constraint_fix = undefined;
    updatedAircraft.managed_altitude_constraint_ft = undefined;
    updatedAircraft.managed_vertical_rate_fpm = undefined;
    updatedAircraft.execution_heading_true_deg = undefined;
    updatedAircraft.execution_speed_kt = undefined;
    updatedAircraft.execution_altitude_ft = undefined;
    updatedAircraft.execution_vertical_rate_fpm = undefined;
    updatedAircraft.managed_speed_kt = undefined;
    updatedAircraft.guidance_active_at_ms = undefined;
    updatedAircraft.heading_active_at_ms = draft.commandActiveAtMs;
    updatedAircraft.scratchpad =
      shouldClearGuidanceScratchpad
        ? removeScratchpadTokens(updatedAircraft.scratchpad ?? "", guidanceTokens)
        : updatedAircraft.scratchpad;
    updatedAircraft.scratchpad_auto_direct_token = undefined;
    updatedAircraft.scratchpad_auto_procedure_token = undefined;
    assigned.heading_true_deg = draft.headingTrue;
  }

  if (draft.commandField === "speed" && draft.speed !== null) {
    assigned.speed_kt = draft.speed;
    updatedAircraft.controller_assigned_speed_kt = draft.speed;
    updatedAircraft.controller_speed_policy = {
      type: "target",
      speed_kt: draft.speed,
      active_at_ms: draft.commandActiveAtMs
    };
    updatedAircraft.speed_control_mode = "controller";
    updatedAircraft.execution_speed_kt = undefined;
    updatedAircraft.speed_active_at_ms = draft.commandActiveAtMs;
  }

  if (draft.commandField === "altitude" && draft.altitude !== null) {
    assigned.altitude_ft = draft.altitude;
    const isStarViaAltitudeClearance =
      updatedAircraft.route_mode === "procedure" &&
      updatedAircraft.procedure_kind === "STAR" &&
      updatedAircraft.vertical_procedure_mode === "des_via";

    updatedAircraft.altitude_control_mode = isStarViaAltitudeClearance ? "managed" : "controller";
    updatedAircraft.vertical_rate_control_mode = isStarViaAltitudeClearance
      ? "managed"
      : updatedAircraft.vertical_rate_control_mode;
    updatedAircraft.vertical_procedure_mode = isStarViaAltitudeClearance ? "des_via" : "controller";
    updatedAircraft.star_via_clearance_altitude_ft = isStarViaAltitudeClearance
      ? draft.altitude
      : undefined;
    updatedAircraft.managed_altitude_constraint_fix = undefined;
    updatedAircraft.managed_altitude_constraint_ft = undefined;
    updatedAircraft.managed_vertical_rate_fpm = undefined;
    updatedAircraft.pending_descent_altitude_ft = undefined;
    updatedAircraft.execution_altitude_ft = undefined;
    updatedAircraft.execution_vertical_rate_fpm = undefined;
    updatedAircraft.altitude_active_at_ms = draft.commandActiveAtMs;
  }

  if (draft.commandField === "verticalRate" && draft.verticalRate !== null) {
    assigned.vertical_rate_fpm = draft.verticalRate;
    updatedAircraft.vertical_rate_control_mode = "controller";
    updatedAircraft.vertical_procedure_mode = "controller";
    updatedAircraft.managed_altitude_constraint_fix = undefined;
    updatedAircraft.managed_altitude_constraint_ft = undefined;
    updatedAircraft.managed_vertical_rate_fpm = undefined;
    updatedAircraft.execution_altitude_ft = undefined;
    updatedAircraft.execution_vertical_rate_fpm = undefined;
    updatedAircraft.vertical_rate_active_at_ms = draft.commandActiveAtMs;
  }

  if (draft.commandField === "scratchpad" && draft.scratchpad !== null) {
    const directToken = activeDirectScratchpadToken(updatedAircraft);
    const procedureToken = activeProcedureScratchpadToken(updatedAircraft);
    updatedAircraft.scratchpad = draft.scratchpad;
    updatedAircraft.scratchpad_auto_direct_token =
      directToken && scratchpadContainsToken(draft.scratchpad, directToken) ? directToken : undefined;
    updatedAircraft.scratchpad_auto_procedure_token =
      procedureToken && scratchpadContainsToken(draft.scratchpad, procedureToken) ? procedureToken : undefined;
  }

  return {
    ...updatedAircraft,
    assigned
  };
}

export function aircraftControlFormAfterCommand(
  currentForm: AircraftControlForm,
  draft: AircraftControlCommandDraft
): AircraftControlForm {
  return {
    ...currentForm,
    ...(draft.commandField === "heading" && draft.headingMag !== null
      ? { heading: formatHeading(draft.headingMag) }
      : {}),
    ...(draft.commandField === "speed" && draft.speed !== null ? { speed: String(draft.speed) } : {}),
    ...(draft.commandField === "altitude" && draft.altitude !== null
      ? { altitude: formatPanelAltitude(draft.altitude) }
      : {}),
    ...(draft.commandField === "verticalRate" && draft.verticalRate !== null
      ? { verticalRate: String(draft.verticalRate) }
      : {}),
    ...(draft.shouldClearControlScratchpad
      ? { scratchpad: removeScratchpadTokens(currentForm.scratchpad, draft.selectedGuidanceTokens) }
      : {}),
    ...(draft.commandField === "scratchpad" && draft.scratchpad !== null
      ? { scratchpad: draft.scratchpad }
      : {})
  };
}
