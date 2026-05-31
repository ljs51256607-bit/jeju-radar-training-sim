import { initialBearingTrueDeg } from "./aircraftMotion";
import {
  activeProcedureScratchpadToken,
  mergeProcedureScratchpad
} from "./aircraftInteraction";
import {
  RKPC_ILS_RWY07_PROCEDURE_ID,
  RKPC_ILS_RWY25_PROCEDURE_ID
} from "./procedureRouteUtils";
import { missedApproachFirstContactProfile } from "./pilotFirstContact";
import type {
  AircraftState,
  MissedApproachProfile,
  ProcedureRecord,
  RadarDataset
} from "./types";

export const MISSED_APPROACH_PROCEDURE_ID_PREFIX = "MISSED_APPROACH";
export const MISSED_APPROACH_SCRATCHPAD_TOKEN = "MA";

export const ILS_Z_MISSED_APPROACH_PROFILES: MissedApproachProfile[] = [
  {
    id: "MISSED_APPROACH_ILS_Z_RWY_07",
    approach_id: RKPC_ILS_RWY07_PROCEDURE_ID,
    name: "ILS Z RWY 07 missed approach",
    runway: "07",
    target_altitude_ft: 8000,
    initial_speed_kt: 180,
    initial_climb_fpm: 1800,
    route: ["PC404", "PETAA"],
    legs: [
      {
        type: "track_to_fix",
        fix_id: "PC404",
        published_track_deg: 66
      },
      {
        type: "turn_track_to_fix",
        turn_direction: "right",
        fix_id: "PETAA",
        published_track_deg: 102
      }
    ],
    hold: {
      fix_id: "PETAA",
      altitude_ft: 8000
    },
    source_text:
      "Climb to 8 000 ft on track of 066° to PC404, then RIGHT turn on track of 102° to PETAA and hold."
  },
  {
    id: "MISSED_APPROACH_ILS_Z_RWY_25",
    approach_id: RKPC_ILS_RWY25_PROCEDURE_ID,
    name: "ILS Z RWY 25 missed approach",
    runway: "25",
    target_altitude_ft: 6000,
    initial_speed_kt: 180,
    initial_climb_fpm: 1800,
    route: ["PC403", "LOTKA"],
    legs: [
      {
        type: "track_to_fix",
        fix_id: "PC403",
        published_track_deg: 246
      },
      {
        type: "turn_track_to_fix",
        turn_direction: "right",
        fix_id: "LOTKA",
        published_track_deg: 263
      }
    ],
    hold: {
      fix_id: "LOTKA",
      altitude_ft: 6000
    },
    source_text:
      "Climb to 6 000 ft on track of 246° to PC403, then RIGHT turn on track of 263° to LOTKA and hold."
  }
];

export interface MissedApproachValidationResult {
  profile_id: string;
  approach_id: string;
  errors: string[];
}

export interface ApplyMissedApproachResult {
  status: "applied" | "error";
  aircraft?: AircraftState;
  profile?: MissedApproachProfile;
  reason?: string;
}

export function missedApproachProfileForApproachId(approachId: string | undefined) {
  const normalizedApproachId = normalizeId(approachId ?? "");

  if (!normalizedApproachId) {
    return null;
  }

  return ILS_Z_MISSED_APPROACH_PROFILES.find((profile) =>
    normalizedApproachId.includes(normalizeId(profile.approach_id))
  ) ?? null;
}

export function missedApproachProfileForAircraft(aircraft: AircraftState) {
  return missedApproachProfileForApproachId(aircraft.procedure_id);
}

export function applyMissedApproachToAircraft({
  aircraft,
  dataset,
  profile = missedApproachProfileForAircraft(aircraft),
  activatedAtMs
}: {
  aircraft: AircraftState;
  dataset: RadarDataset;
  profile?: MissedApproachProfile | null;
  activatedAtMs: number;
}): ApplyMissedApproachResult {
  if (!profile) {
    return {
      status: "error",
      reason: "no ILS Z missed approach profile for active approach"
    };
  }

  const firstFixId = profile.route[0];
  const firstFix = firstFixId ? resolveMissedApproachFix(dataset, firstFixId) : null;

  if (!firstFixId || !firstFix) {
    return {
      status: "error",
      profile,
      reason: `missing missed approach first fix ${firstFixId ?? "-"}`
    };
  }

  const headingTrueDeg = initialBearingTrueDeg(
    aircraft.latitude,
    aircraft.longitude,
    firstFix.latitude,
    firstFix.longitude
  );
  const previousProcedureToken = activeProcedureScratchpadToken(aircraft);

  return {
    status: "applied",
    profile,
    aircraft: {
      ...aircraft,
      flight_phase: "arrival",
      route_mode: "procedure",
      next_fix: firstFixId,
      procedure_id: profile.id,
      procedure_name: profile.name,
      procedure_kind: "APP",
      procedure_route: [...profile.route],
      procedure_route_index: 0,
      procedure_capture_transition: undefined,
      approach_phase: "missed",
      missed_approach_profile_id: profile.id,
      missed_approach_activated_at_ms: activatedAtMs,
      missed_approach_reported_at_ms: undefined,
      landing_state: undefined,
      landed_at_ms: undefined,
      altitude_control_mode: "controller",
      vertical_rate_control_mode: "controller",
      vertical_procedure_mode: "controller",
      speed_control_mode: "controller",
      controller_assigned_speed_kt: profile.initial_speed_kt,
      controller_speed_policy: {
        type: "target",
        speed_kt: profile.initial_speed_kt,
        active_at_ms: activatedAtMs
      },
      guidance_active_at_ms: activatedAtMs,
      heading_active_at_ms: activatedAtMs,
      speed_active_at_ms: activatedAtMs,
      altitude_active_at_ms: activatedAtMs,
      vertical_rate_active_at_ms: activatedAtMs,
      execution_heading_true_deg: headingTrueDeg,
      execution_speed_kt: profile.initial_speed_kt,
      execution_altitude_ft: profile.target_altitude_ft,
      execution_vertical_rate_fpm: profile.initial_climb_fpm,
      managed_speed_kt: undefined,
      managed_altitude_constraint_fix: undefined,
      managed_altitude_constraint_ft: undefined,
      managed_vertical_rate_fpm: undefined,
      pending_descent_altitude_ft: undefined,
      star_via_clearance_altitude_ft: undefined,
      energy_mode: "normal",
      turn_state: undefined,
      pilot_first_contact: missedApproachFirstContactProfile(),
      frequency_state: "not_on_frequency",
      scratchpad: mergeProcedureScratchpad(
        aircraft.scratchpad ?? "",
        previousProcedureToken,
        MISSED_APPROACH_SCRATCHPAD_TOKEN
      ),
      scratchpad_auto_procedure_token: MISSED_APPROACH_SCRATCHPAD_TOKEN,
      assigned: {
        ...aircraft.assigned,
        speed_kt: profile.initial_speed_kt,
        altitude_ft: profile.target_altitude_ft,
        vertical_rate_fpm: profile.initial_climb_fpm
      }
    }
  };
}

export function validateIlsZMissedApproachProfiles(
  dataset: RadarDataset
): MissedApproachValidationResult[] {
  return ILS_Z_MISSED_APPROACH_PROFILES.map((profile) => {
    const errors: string[] = [];
    const approach = dataset.procedures.approaches.find((candidate) =>
      normalizeId(candidate.id) === normalizeId(profile.approach_id)
    );

    if (!approach) {
      errors.push(`missing approach record ${profile.approach_id}`);
    } else {
      errors.push(...validateProfileAgainstApproachText(profile, approach));
    }

    for (const fixId of [...profile.route, profile.hold.fix_id]) {
      if (!resolveMissedApproachFix(dataset, fixId)) {
        errors.push(`missing fix ${fixId}`);
      }
    }

    if (profile.route[profile.route.length - 1] !== profile.hold.fix_id) {
      errors.push(`hold fix ${profile.hold.fix_id} is not final route fix`);
    }

    if (profile.hold.altitude_ft !== profile.target_altitude_ft) {
      errors.push(`hold altitude ${profile.hold.altitude_ft} differs from target altitude ${profile.target_altitude_ft}`);
    }

    return {
      profile_id: profile.id,
      approach_id: profile.approach_id,
      errors
    };
  });
}

function validateProfileAgainstApproachText(
  profile: MissedApproachProfile,
  approach: ProcedureRecord
) {
  const errors: string[] = [];
  const missedText = normalizeText(approach.missed_approach ?? "");
  const compactMissedText = missedText.replace(/\s/g, "");

  if (!missedText) {
    errors.push(`approach ${approach.id} has no missed_approach text`);
    return errors;
  }

  for (const leg of profile.legs) {
    if (!missedText.includes(normalizeText(leg.fix_id))) {
      errors.push(`missed text does not mention ${leg.fix_id}`);
    }

    if (!missedText.includes(String(leg.published_track_deg).padStart(3, "0"))) {
      errors.push(`missed text does not mention track ${String(leg.published_track_deg).padStart(3, "0")}`);
    }

    if (leg.turn_direction && !missedText.includes(leg.turn_direction.toUpperCase())) {
      errors.push(`missed text does not mention ${leg.turn_direction.toUpperCase()} turn`);
    }
  }

  if (!compactMissedText.includes(String(profile.target_altitude_ft))) {
    errors.push(`missed text does not mention target altitude ${profile.target_altitude_ft}`);
  }

  return errors;
}

function resolveMissedApproachFix(dataset: RadarDataset, fixId: string) {
  const normalizedFixId = normalizeId(fixId);
  const procedureFix = dataset.procedures.fixes.find(
    (fix) => normalizeId(fix.id) === normalizedFixId
  );

  if (procedureFix) {
    return {
      id: procedureFix.id,
      latitude: procedureFix.latitude,
      longitude: procedureFix.longitude
    };
  }

  const videoLabel = dataset.videomapLabels?.labels?.find(
    (label) => normalizeId(label.text) === normalizedFixId
  );

  if (videoLabel) {
    return {
      id: videoLabel.id,
      latitude: videoLabel.latitude,
      longitude: videoLabel.longitude
    };
  }

  const referencePoint = dataset.geometry?.reference_points?.find(
    (point) =>
      normalizeId(point.id) === normalizedFixId &&
      typeof point.latitude === "number" &&
      typeof point.longitude === "number"
  );

  if (
    referencePoint &&
    typeof referencePoint.latitude === "number" &&
    typeof referencePoint.longitude === "number"
  ) {
    return {
      id: referencePoint.id,
      latitude: referencePoint.latitude,
      longitude: referencePoint.longitude
    };
  }

  return null;
}

function normalizeId(value: string) {
  return value.trim().toUpperCase();
}

function normalizeText(value: string) {
  return value.toUpperCase().replace(/[,._-]/g, " ").replace(/\s+/g, " ").trim();
}
