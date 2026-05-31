import { initialBearingTrueDeg } from "./aircraftMotion";
import {
  magneticToTrueHeading,
  parseAltitudeInput,
  parseHeadingInput,
  parseSpeedInput,
  parseVerticalRateInput
} from "./aircraftControlPanel";
import {
  arrivalStarGuidanceForFix,
  departureRollStateForRunway,
  departureSidGuidanceForExitFix
} from "./aircraftFactory";
import {
  arrivalFirstContactProfile,
  departureFirstContactProfile,
  isAppFirstContactEntryFix
} from "./pilotFirstContact";
import { resolveDirectFix } from "./procedureGuidance";
import { procedureScratchpadToken } from "./procedureRouteUtils";
import {
  callsignForCreateInput,
  DEPARTURE_BELOW_10000_TARGET_SPEED_KT,
  DEPARTURE_ROLL_INITIAL_ALTITUDE_FT,
  DEPARTURE_ROLL_INITIAL_SPEED_KT,
  DEPARTURE_TARGET_ALTITUDE_FT,
  directScratchpad,
  firstAvailableDepartureFixId,
  normalizeFixId,
  normalizeScratchpadText,
  sanitizeCallsignInput,
  type AircraftCreateForm,
  type MapSpawnPoint
} from "./scenarioTraffic";
import type {
  AircraftState,
  DepartureRunway,
  ProcedureRecord,
  RadarDataset,
  RunwayMode
} from "./types";

export type AircraftCreateDraftResult =
  | {
      status: "created";
      aircraft: AircraftState;
    }
  | {
      status: "error";
      message: string;
      activateMapPick?: boolean;
    };

interface BuildAircraftCreateDraftArgs {
  dataset: RadarDataset;
  form: AircraftCreateForm;
  existingAircraft: AircraftState[];
  selectedRunway: RunwayMode;
  stars: ProcedureRecord[];
  mapSpawnPoint: MapSpawnPoint | null;
  magneticVariationWestDeg: number;
  createdAtMs: number;
  guidanceActiveAtMs: number;
}

export function buildAircraftCreateDraft({
  dataset,
  form,
  existingAircraft,
  selectedRunway,
  stars,
  mapSpawnPoint,
  magneticVariationWestDeg,
  createdAtMs,
  guidanceActiveAtMs
}: BuildAircraftCreateDraftArgs): AircraftCreateDraftResult {
  const isDepartureCreate = form.phase === "departure";
  const callsign = callsignForCreateInput(form.callsign, existingAircraft);
  const aircraftType = normalizeScratchpadText(form.aircraftType);
  const positionFixId = normalizeFixId(form.positionFix);
  const positionFix =
    !isDepartureCreate && form.spawnMode === "fix" ? resolveDirectFix(dataset, positionFixId) : null;
  const mapDirectFix =
    !isDepartureCreate && form.spawnMode === "map" && positionFixId
      ? resolveDirectFix(dataset, positionFixId)
      : null;
  const departureRunwayForCreate: DepartureRunway =
    selectedRunway === "07" ? "07" : form.departureRunway === "31" ? "31" : "25";
  const departureExitFixForCreate = isDepartureCreate
    ? firstAvailableDepartureFixId(dataset, departureRunwayForCreate, form.exitFix)
    : form.exitFix;
  const departureGuidance = isDepartureCreate
    ? departureSidGuidanceForExitFix(dataset, departureRunwayForCreate, departureExitFixForCreate)
    : null;
  const headingMag = parseHeadingInput(form.heading);
  const speed = parseSpeedInput(form.speed);
  const altitude = parseAltitudeInput(form.altitude);
  const verticalRate = parseVerticalRateInput(form.verticalRate);
  const squawk = normalizeScratchpadText(form.squawk);
  const scratchpad = normalizeScratchpadText(form.scratchpad);

  if (!callsign) {
    return { status: "error", message: "CALLSIGN 필요" };
  }

  if (!aircraftType) {
    return { status: "error", message: "TYPE 필요" };
  }

  if (!isDepartureCreate && form.spawnMode === "fix" && !positionFix) {
    return { status: "error", message: `${positionFixId || "FIX"} 좌표 없음` };
  }

  if (isDepartureCreate && !departureGuidance) {
    return {
      status: "error",
      message: `RWY${departureRunwayForCreate} ${departureExitFixForCreate} SID route 좌표 없음`
    };
  }

  if (!isDepartureCreate && form.spawnMode === "map" && positionFixId && !mapDirectFix) {
    return { status: "error", message: `${positionFixId} 좌표 없음` };
  }

  if (!isDepartureCreate && form.spawnMode === "map" && !mapSpawnPoint) {
    return { status: "error", message: "MAP 위치 필요: PICK MAP 후 지도 클릭", activateMapPick: true };
  }

  if (headingMag === null) {
    return { status: "error", message: "HDG는 2-3자리 숫자: 35=350, 02=020, 215=215" };
  }

  if (speed === null) {
    return { status: "error", message: "SPD는 2-3자리 숫자: 18=180, 25=250, 185=185" };
  }

  if (altitude === null) {
    return { status: "error", message: "ALT는 A080, F180, 8000 형식" };
  }

  if (verticalRate === null) {
    return { status: "error", message: "VS는 -6000~6000 숫자" };
  }

  const duplicateCallsign = existingAircraft.some(
    (aircraft) => sanitizeCallsignInput(aircraft.callsign) === callsign
  );

  if (duplicateCallsign) {
    return { status: "error", message: `${callsign} 이미 존재` };
  }

  const headingTrue = magneticToTrueHeading(headingMag, magneticVariationWestDeg);
  const spawnLatitude =
    isDepartureCreate && departureGuidance
      ? departureGuidance.runway.threshold.latitude
      : form.spawnMode === "map" && mapSpawnPoint
        ? mapSpawnPoint.latitude
        : positionFix?.latitude;
  const spawnLongitude =
    isDepartureCreate && departureGuidance
      ? departureGuidance.runway.threshold.longitude
      : form.spawnMode === "map" && mapSpawnPoint
        ? mapSpawnPoint.longitude
        : positionFix?.longitude;

  if (typeof spawnLatitude !== "number" || typeof spawnLongitude !== "number") {
    return { status: "error", message: "생성 위치 좌표 없음" };
  }

  const arrivalStarGuidance =
    !isDepartureCreate && form.phase === "arrival" && form.spawnMode === "fix"
      ? arrivalStarGuidanceForFix(dataset, stars, positionFixId, spawnLatitude, spawnLongitude)
      : null;
  const mapDirectHeadingTrue =
    mapDirectFix !== null
      ? initialBearingTrueDeg(spawnLatitude, spawnLongitude, mapDirectFix.latitude, mapDirectFix.longitude)
      : undefined;
  const arrivalFirstContactFixForCreate =
    !isDepartureCreate && form.phase === "arrival" && positionFixId && isAppFirstContactEntryFix(positionFixId)
      ? positionFixId
      : undefined;

  if (!isDepartureCreate && form.phase === "arrival" && form.spawnMode === "fix" && !arrivalStarGuidance) {
    return { status: "error", message: `${positionFixId}는 RWY ${selectedRunway} STAR 경로에 없음` };
  }

  const createdAtFixId = isDepartureCreate
    ? `RWY ${departureGuidance?.sid.runway ?? departureRunwayForCreate}`
    : form.spawnMode === "fix"
      ? positionFix?.id ?? positionFixId
      : `${spawnLatitude.toFixed(4)}, ${spawnLongitude.toFixed(4)}`;
  const directToken = isDepartureCreate
    ? directScratchpad(departureExitFixForCreate)
    : form.phase === "arrival" && form.spawnMode === "fix"
      ? directScratchpad(positionFixId)
      : mapDirectFix
        ? directScratchpad(positionFixId)
        : undefined;
  const procedureToken = isDepartureCreate
    ? "SID"
    : arrivalStarGuidance
      ? procedureScratchpadToken("STAR", arrivalStarGuidance.star, "cancel_level")
      : undefined;
  const initialGuidanceTimeMs =
    arrivalStarGuidance || mapDirectFix || isDepartureCreate ? guidanceActiveAtMs : undefined;
  const currentHeadingTrue =
    isDepartureCreate && departureGuidance
      ? departureGuidance.runway.true_bearing_deg
      : arrivalStarGuidance?.headingTrueDeg ?? mapDirectHeadingTrue ?? headingTrue;
  const assignedHeadingTrue =
    isDepartureCreate && departureGuidance
      ? departureGuidance.runway.true_bearing_deg
      : arrivalStarGuidance?.headingTrueDeg ?? mapDirectHeadingTrue ?? headingTrue;

  return {
    status: "created",
    aircraft: {
      id: `SIM-${createdAtMs.toString(36).toUpperCase()}`,
      callsign,
      aircraft_type: aircraftType,
      flight_phase: form.phase,
      latitude: spawnLatitude,
      longitude: spawnLongitude,
      heading_true_deg: currentHeadingTrue,
      indicated_speed_kt: isDepartureCreate ? DEPARTURE_ROLL_INITIAL_SPEED_KT : speed,
      ground_speed_kt: isDepartureCreate ? DEPARTURE_ROLL_INITIAL_SPEED_KT : speed,
      altitude_ft: isDepartureCreate ? DEPARTURE_ROLL_INITIAL_ALTITUDE_FT : altitude,
      vertical_rate_fpm: isDepartureCreate ? 0 : verticalRate,
      route_mode: isDepartureCreate ? "procedure" : arrivalStarGuidance ? "procedure" : mapDirectFix ? "direct" : "vector",
      next_fix: isDepartureCreate
        ? departureGuidance?.firstFixId
        : arrivalStarGuidance?.nextFixId ?? (mapDirectFix ? positionFixId : undefined),
      procedure_id: isDepartureCreate ? departureGuidance?.sid.id : arrivalStarGuidance?.star.id,
      procedure_name: isDepartureCreate ? departureGuidance?.sid.name : arrivalStarGuidance?.star.name,
      procedure_kind: isDepartureCreate ? "SID" : arrivalStarGuidance ? "STAR" : undefined,
      procedure_runtime_authority: isDepartureCreate ? departureGuidance?.sid.runtime_authority : undefined,
      procedure_motion_source: isDepartureCreate ? departureGuidance?.sid.motion_source : undefined,
      procedure_reference_overlay_role: isDepartureCreate ? departureGuidance?.sid.reference_overlay_role : undefined,
      procedure_exact_runtime_route_allowed: isDepartureCreate
        ? departureGuidance?.sid.exact_runtime_route_allowed
        : undefined,
      procedure_training_runtime_path_allowed: isDepartureCreate
        ? departureGuidance?.sid.training_runtime_path_allowed
        : undefined,
      procedure_route: isDepartureCreate ? departureGuidance?.route : arrivalStarGuidance?.route,
      procedure_route_index: isDepartureCreate ? 0 : arrivalStarGuidance?.routeIndex,
      guidance_active_at_ms: initialGuidanceTimeMs,
      heading_active_at_ms: initialGuidanceTimeMs,
      target_runway: isDepartureCreate ? departureRunwayForCreate : selectedRunway,
      departure_runway: isDepartureCreate ? departureRunwayForCreate : undefined,
      departure_roll: isDepartureCreate && departureGuidance
        ? departureRollStateForRunway(dataset, departureRunwayForCreate)
        : undefined,
      planned_entry_fix: !isDepartureCreate
        ? arrivalFirstContactFixForCreate ?? (form.spawnMode === "fix" ? positionFixId : undefined)
        : undefined,
      planned_exit_fix: isDepartureCreate ? departureExitFixForCreate : undefined,
      assigned: {
        heading_true_deg: assignedHeadingTrue,
        speed_kt: isDepartureCreate ? DEPARTURE_BELOW_10000_TARGET_SPEED_KT : speed,
        altitude_ft: isDepartureCreate ? DEPARTURE_TARGET_ALTITUDE_FT : altitude,
        vertical_rate_fpm: verticalRate
      },
      speed_control_mode: "managed",
      altitude_control_mode: isDepartureCreate ? "managed" : "controller",
      vertical_rate_control_mode: isDepartureCreate ? "managed" : "controller",
      vertical_procedure_mode: arrivalStarGuidance ? "cancel_level" : "controller",
      managed_speed_kt: isDepartureCreate ? DEPARTURE_BELOW_10000_TARGET_SPEED_KT : speed,
      owner_position: isDepartureCreate ? "DEP" : "APP",
      arrival_airport: !isDepartureCreate && form.phase === "arrival"
        ? normalizeScratchpadText(form.arrivalAirport || "RKPC")
        : undefined,
      destination_airport: isDepartureCreate
        ? normalizeScratchpadText(form.destinationAirport || "RKSS")
        : undefined,
      squawk: squawk || undefined,
      scratchpad: [scratchpad, directToken, procedureToken].filter(Boolean).join(" ") || undefined,
      scratchpad_auto_direct_token: directToken,
      scratchpad_auto_procedure_token: procedureToken,
      pilot_first_contact: isDepartureCreate
        ? departureFirstContactProfile()
        : arrivalFirstContactFixForCreate
          ? arrivalFirstContactProfile(arrivalFirstContactFixForCreate, callsign)
          : undefined,
      frequency_state: isDepartureCreate || arrivalFirstContactFixForCreate ? "not_on_frequency" : "on_frequency",
      remark: isDepartureCreate && departureGuidance
        ? `Created at ${createdAtFixId}, auto SID ${departureGuidance.sid.name}, takeoff roll then climb A100`
        : arrivalStarGuidance
          ? `Created at ${createdAtFixId}, auto STAR ${arrivalStarGuidance.star.name}`
          : mapDirectFix
            ? `Created at ${createdAtFixId}, direct ${positionFixId}`
            : `Created at ${createdAtFixId}`
    }
  };
}
