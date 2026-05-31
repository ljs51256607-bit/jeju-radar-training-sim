import { initialBearingTrueDeg } from "./aircraftMotion";
import {
  formatHeading,
  trueToMagneticHeading,
  type AircraftControlForm
} from "./aircraftControlPanel";
import {
  mergeDirectScratchpad,
  removeScratchpadToken
} from "./aircraftInteraction";
import {
  directScratchpad,
  normalizeFixId
} from "./scenarioTraffic";
import type { AircraftState, MapLabel } from "./types";

export interface MapDirectToFixDraft {
  fixId: string;
  directToken: string;
  fixLatitude: number;
  fixLongitude: number;
  guidanceActiveAtMs: number | undefined;
}

export function buildMapDirectToFixDraft(
  fix: Pick<MapLabel, "text" | "latitude" | "longitude">,
  guidanceActiveAtMs: number | undefined
): MapDirectToFixDraft {
  const fixId = normalizeFixId(fix.text);

  return {
    fixId,
    directToken: directScratchpad(fixId),
    fixLatitude: fix.latitude,
    fixLongitude: fix.longitude,
    guidanceActiveAtMs
  };
}

export function applyMapDirectToFixDraftToAircraft(
  aircraft: AircraftState,
  draft: MapDirectToFixDraft
): AircraftState {
  const headingTrue = initialBearingTrueDeg(
    aircraft.latitude,
    aircraft.longitude,
    draft.fixLatitude,
    draft.fixLongitude
  );
  const scratchpadWithoutProcedure = aircraft.scratchpad_auto_procedure_token
    ? removeScratchpadToken(aircraft.scratchpad ?? "", aircraft.scratchpad_auto_procedure_token)
    : aircraft.scratchpad ?? "";

  return {
    ...aircraft,
    route_mode: "direct",
    next_fix: draft.fixId,
    procedure_id: undefined,
    procedure_name: undefined,
    procedure_kind: undefined,
    procedure_route: undefined,
    procedure_route_index: undefined,
    vertical_procedure_mode: "controller",
    star_via_clearance_altitude_ft: undefined,
    managed_altitude_constraint_fix: undefined,
    managed_altitude_constraint_ft: undefined,
    managed_vertical_rate_fpm: undefined,
    execution_heading_true_deg: headingTrue,
    execution_speed_kt: undefined,
    execution_altitude_ft: undefined,
    execution_vertical_rate_fpm: undefined,
    managed_speed_kt: undefined,
    guidance_active_at_ms: draft.guidanceActiveAtMs,
    heading_active_at_ms: draft.guidanceActiveAtMs,
    scratchpad: mergeDirectScratchpad(
      scratchpadWithoutProcedure,
      aircraft.scratchpad_auto_direct_token,
      draft.directToken
    ),
    scratchpad_auto_direct_token: draft.directToken,
    scratchpad_auto_procedure_token: undefined,
    assigned: {
      ...aircraft.assigned
    }
  };
}

export function mapDirectToFixControlFormAfterDraft(
  currentForm: AircraftControlForm,
  aircraft: AircraftState,
  draft: MapDirectToFixDraft,
  magneticVariationWestDeg: number
): AircraftControlForm {
  const headingTrue = initialBearingTrueDeg(
    aircraft.latitude,
    aircraft.longitude,
    draft.fixLatitude,
    draft.fixLongitude
  );
  const headingMag = trueToMagneticHeading(headingTrue, magneticVariationWestDeg);
  const scratchpadWithoutProcedure = aircraft.scratchpad_auto_procedure_token
    ? removeScratchpadToken(
        aircraft.scratchpad ?? currentForm.scratchpad,
        aircraft.scratchpad_auto_procedure_token
      )
    : aircraft.scratchpad ?? currentForm.scratchpad;

  return {
    ...currentForm,
    heading: formatHeading(headingMag),
    scratchpad: mergeDirectScratchpad(
      scratchpadWithoutProcedure,
      aircraft.scratchpad_auto_direct_token,
      draft.directToken
    )
  };
}
