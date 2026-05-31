import {
  destinationPoint,
  distanceNmBetweenPoints,
  initialBearingTrueDeg
} from "./aircraftMotion";
import {
  arrivalFirstContactProfile,
  departureFirstContactProfile,
  isAppFirstContactEntryFix
} from "./pilotFirstContact";
import { activeRouteTargetFixId, resolveDirectFix } from "./procedureGuidance";
import {
  matchingSidForExitFix,
  matchingStarForEntryFix,
  matchingStarIncludingFix,
  procedureRouteFromRecord,
  procedureScratchpadToken,
  procedureVisibleForRunwayMode
} from "./procedureRouteUtils";
import { conventionalSidRuntimeRouteForExitFix } from "./conventionalSidRuntimeRoutes";
import type { ArrivalStream, DepartureWave } from "./scenarioStorage";
import {
  DEPARTURE_BELOW_10000_TARGET_SPEED_KT,
  DEPARTURE_RELEASE_ALTITUDE_FT,
  DEPARTURE_RELEASE_SPEED_KT,
  DEPARTURE_ROLL_ACCEL_KT_SEC,
  DEPARTURE_ROLL_INITIAL_ALTITUDE_FT,
  DEPARTURE_ROLL_INITIAL_SPEED_KT,
  DEPARTURE_TARGET_ALTITUDE_FT,
  directScratchpad,
  nextUniqueCallsign,
  normalizeFixId,
  squawkForSequence
} from "./scenarioTraffic";
import { runwayModeForDepartureRunway } from "./scenarioStorage";
import type {
  AircraftState,
  DepartureRunway,
  ProcedureRecord,
  RadarDataset
} from "./types";

export function runwayForMode(dataset: RadarDataset, runwayMode: string) {
  return dataset.airport.runways.find((runway) => runway.id === runwayMode);
}

function reciprocalRunwayId(runwayMode: string) {
  if (runwayMode === "07") {
    return "25";
  }

  if (runwayMode === "25") {
    return "07";
  }

  if (runwayMode === "31") {
    return "13";
  }

  return "31";
}

function runwayDepartureEnd(dataset: RadarDataset, runwayMode: string) {
  const runway = runwayForMode(dataset, runwayMode);
  const reciprocalRunway = dataset.airport.runways.find(
    (candidateRunway) => candidateRunway.id === reciprocalRunwayId(runwayMode)
  );

  if (reciprocalRunway) {
    return reciprocalRunway.threshold;
  }

  if (!runway) {
    return null;
  }

  const fallbackEnd = destinationPoint(
    runway.threshold.latitude,
    runway.threshold.longitude,
    runway.true_bearing_deg,
    runway.length_m / 1852
  );

  return {
    latitude: fallbackEnd.latitude,
    longitude: fallbackEnd.longitude
  };
}

export function departureRollStateForRunway(dataset: RadarDataset, runwayMode: string) {
  const runway = runwayForMode(dataset, runwayMode);
  const departureEnd = runwayDepartureEnd(dataset, runwayMode);

  if (!runway || !departureEnd) {
    return undefined;
  }

  return {
    active: true,
    runway: runwayMode,
    end_latitude: departureEnd.latitude,
    end_longitude: departureEnd.longitude,
    total_distance_nm: distanceNmBetweenPoints(
      runway.threshold.latitude,
      runway.threshold.longitude,
      departureEnd.latitude,
      departureEnd.longitude
    ),
    release_altitude_ft: DEPARTURE_RELEASE_ALTITUDE_FT,
    release_speed_kt: DEPARTURE_RELEASE_SPEED_KT,
    accel_kt_sec: DEPARTURE_ROLL_ACCEL_KT_SEC
  };
}

function conventionalDepartureRoute(exitFix: string) {
  const normalizedExitFix = normalizeFixId(exitFix);

  if (normalizedExitFix === "MAKET") {
    return ["YDM", "MAKET"];
  }

  if (normalizedExitFix === "IPDAS") {
    return ["YDM", "CJU", "IPDAS"];
  }

  return [normalizedExitFix];
}

function buildFallbackDepartureProcedure(exitFix: string, runway: DepartureRunway): ProcedureRecord {
  const normalizedExitFix = normalizeFixId(exitFix);
  const route = conventionalDepartureRoute(normalizedExitFix);

  return {
    id: `CONV_${normalizedExitFix}_${runway}`,
    name: `${normalizedExitFix} GATE ${runway}`,
    runway,
    route_text: route.join(" - "),
    extraction_status: "scenario_conventional_gate"
  };
}

function airwayIdsFromTransferText(airwayText: string) {
  return airwayText
    .split(/[\/,\s]+/)
    .map((airwayId) => airwayId.trim().replace("*", "").toUpperCase())
    .filter(Boolean);
}

function lineStringCoordinates(coordinates: unknown) {
  if (!Array.isArray(coordinates)) {
    return [];
  }

  return coordinates
    .filter(
      (coordinate): coordinate is [number, number] =>
        Array.isArray(coordinate) &&
        coordinate.length >= 2 &&
        typeof coordinate[0] === "number" &&
        typeof coordinate[1] === "number"
    )
    .map(([longitude, latitude]) => ({ latitude, longitude }));
}

function arrivalTransferAnchorForFix(dataset: RadarDataset, entryFix: string) {
  const normalizedEntryFix = normalizeFixId(entryFix);

  return dataset.transferRules.interfacility_transfer_anchors.arrivals_into_jeju_tma.find(
    (anchor) =>
      normalizeFixId(anchor.fix_id ?? "") === normalizedEntryFix ||
      normalizeFixId(anchor.fix_name ?? "") === normalizedEntryFix
  );
}

function atsRouteFeatureForAirway(dataset: RadarDataset, airwayId: string) {
  const normalizedAirwayId = normalizeFixId(airwayId);

  return dataset.atsRouteLines.features.find(
    (feature) => normalizeFixId(String(feature.properties.route_id ?? "")) === normalizedAirwayId
  );
}

function airportArpPoint(dataset: RadarDataset) {
  return {
    latitude: dataset.airport.airport_meta.arp.latitude,
    longitude: dataset.airport.airport_meta.arp.longitude
  };
}

function distanceFromAirportNm(dataset: RadarDataset, point: { latitude: number; longitude: number }) {
  const airport = airportArpPoint(dataset);

  return distanceNmBetweenPoints(airport.latitude, airport.longitude, point.latitude, point.longitude);
}

function outboundBearingForArrivalAirway(dataset: RadarDataset, entryFix: string) {
  const entryTarget = resolveDirectFix(dataset, entryFix);
  const transferAnchor = arrivalTransferAnchorForFix(dataset, entryFix);

  if (!entryTarget || !transferAnchor) {
    return undefined;
  }

  const entryDistanceFromAirportNm = distanceFromAirportNm(dataset, entryTarget);
  let selectedLeg:
    | {
        outboundBearing: number;
        outsideScoreNm: number;
      }
    | undefined;

  for (const airwayId of airwayIdsFromTransferText(transferAnchor.airway)) {
    const routeFeature = atsRouteFeatureForAirway(dataset, airwayId);
    const coordinates =
      routeFeature?.geometry.type === "LineString" ? lineStringCoordinates(routeFeature.geometry.coordinates) : [];

    if (coordinates.length === 0) {
      continue;
    }

    let nearestIndex = -1;
    let nearestDistanceNm = Number.POSITIVE_INFINITY;

    coordinates.forEach((coordinate, index) => {
      const distanceNm = distanceNmBetweenPoints(
        entryTarget.latitude,
        entryTarget.longitude,
        coordinate.latitude,
        coordinate.longitude
      );

      if (distanceNm < nearestDistanceNm) {
        nearestDistanceNm = distanceNm;
        nearestIndex = index;
      }
    });

    if (nearestIndex < 0 || nearestDistanceNm > 0.5) {
      continue;
    }

    for (const adjacentIndex of [nearestIndex - 1, nearestIndex + 1]) {
      const adjacentCoordinate = coordinates[adjacentIndex];

      if (!adjacentCoordinate) {
        continue;
      }

      const outsideScoreNm = distanceFromAirportNm(dataset, adjacentCoordinate) - entryDistanceFromAirportNm;
      const outboundBearing = initialBearingTrueDeg(
        entryTarget.latitude,
        entryTarget.longitude,
        adjacentCoordinate.latitude,
        adjacentCoordinate.longitude
      );

      if (!selectedLeg || outsideScoreNm > selectedLeg.outsideScoreNm) {
        selectedLeg = {
          outboundBearing,
          outsideScoreNm
        };
      }
    }
  }

  return selectedLeg?.outboundBearing;
}

export function departureSidGuidanceForExitFix(
  dataset: RadarDataset,
  departureRunway: DepartureRunway,
  exitFix: string
) {
  const normalizedExitFix = normalizeFixId(exitFix);
  const runwayMode = runwayModeForDepartureRunway(departureRunway);
  const sids = dataset.procedures.sids.filter((procedure) =>
    procedureVisibleForRunwayMode(procedure, runwayMode)
  );
  const physicalRunwaySids = sids.filter((procedure) => procedure.runway === departureRunway);
  const publishedSid = matchingSidForExitFix(physicalRunwaySids, normalizedExitFix);
  const conventionalRuntimeRoute = publishedSid
    ? null
    : conventionalSidRuntimeRouteForExitFix(dataset, departureRunway, normalizedExitFix);
  const sid =
    publishedSid ??
    conventionalRuntimeRoute?.procedure ??
    buildFallbackDepartureProcedure(normalizedExitFix, departureRunway);
  const runway = runwayForMode(dataset, departureRunway);
  const route = conventionalRuntimeRoute?.route ?? procedureRouteFromRecord(sid, "SID");
  const firstFixId = route[0];
  const firstFix = firstFixId ? resolveDirectFix(dataset, firstFixId) : null;

  if (!runway || !firstFix) {
    return null;
  }

  return {
    runway,
    sid,
    route,
    firstFixId,
    headingToFirstFix: initialBearingTrueDeg(
      runway.threshold.latitude,
      runway.threshold.longitude,
      firstFix.latitude,
      firstFix.longitude
    )
  };
}

function outboundBearingForArrivalSpawn(
  dataset: RadarDataset,
  entryFix: string,
  star?: ProcedureRecord
) {
  const entryTarget = resolveDirectFix(dataset, entryFix);
  const airwayBearing = outboundBearingForArrivalAirway(dataset, entryFix);

  if (typeof airwayBearing === "number") {
    return airwayBearing;
  }

  const route = star ? procedureRouteFromRecord(star, "STAR") : [];
  const secondFixId = route.find((routeFixId) => normalizeFixId(routeFixId) !== normalizeFixId(entryFix));
  const secondTarget = secondFixId ? resolveDirectFix(dataset, secondFixId) : null;

  if (entryTarget && secondTarget) {
    return initialBearingTrueDeg(
      secondTarget.latitude,
      secondTarget.longitude,
      entryTarget.latitude,
      entryTarget.longitude
    );
  }

  const airportLatitude = dataset.airport.airport_meta.arp.latitude;
  const airportLongitude = dataset.airport.airport_meta.arp.longitude;

  if (entryTarget) {
    return initialBearingTrueDeg(airportLatitude, airportLongitude, entryTarget.latitude, entryTarget.longitude);
  }

  return 0;
}

function distanceFromArrivalEntryNm(
  dataset: RadarDataset,
  aircraft: AircraftState,
  entryFix: string
) {
  const entryTarget = resolveDirectFix(dataset, entryFix);

  if (!entryTarget) {
    return 0;
  }

  return distanceNmBetweenPoints(
    aircraft.latitude,
    aircraft.longitude,
    entryTarget.latitude,
    entryTarget.longitude
  );
}

export function aircraftIsPreEntryForArrivalStream(aircraft: AircraftState, entryFix: string) {
  return (
    normalizeFixId(aircraft.planned_entry_fix ?? "") === normalizeFixId(entryFix) &&
    normalizeFixId(activeRouteTargetFixId(aircraft) ?? "") === normalizeFixId(entryFix)
  );
}

export function farthestArrivalDistanceNm(
  dataset: RadarDataset,
  aircraftList: AircraftState[],
  entryFix: string
) {
  return aircraftList
    .filter((aircraft) => aircraftIsPreEntryForArrivalStream(aircraft, entryFix))
    .reduce(
      (farthestDistanceNm, aircraft) =>
        Math.max(farthestDistanceNm, distanceFromArrivalEntryNm(dataset, aircraft, entryFix)),
      0
    );
}

export function createArrivalStreamAircraft(
  dataset: RadarDataset,
  stream: ArrivalStream,
  distanceFromEntryNm: number,
  existingAircraft: AircraftState[],
  sequenceSeed: number,
  spawnedAtMs: number
) {
  const entryFix = resolveDirectFix(dataset, stream.entryFix);
  const stars = dataset.procedures.stars.filter((procedure) =>
    procedureVisibleForRunwayMode(procedure, stream.runway)
  );
  const star = matchingStarForEntryFix(stars, stream.entryFix);
  const route = star ? procedureRouteFromRecord(star, "STAR") : [stream.entryFix];
  const outboundBearing = outboundBearingForArrivalSpawn(dataset, stream.entryFix, star);

  if (!entryFix || route.some((fixId) => !resolveDirectFix(dataset, fixId))) {
    return null;
  }

  const position = destinationPoint(
    entryFix.latitude,
    entryFix.longitude,
    outboundBearing,
    distanceFromEntryNm
  );
  const headingToEntry = initialBearingTrueDeg(
    position.latitude,
    position.longitude,
    entryFix.latitude,
    entryFix.longitude
  );
  const callsign = nextUniqueCallsign(stream.callsignPrefix, existingAircraft, sequenceSeed);
  const directToken = directScratchpad(stream.entryFix);
  const procedureToken = star ? procedureScratchpadToken("STAR", star, "cancel_level") : undefined;

  return {
    id: `ARR-${spawnedAtMs.toString(36).toUpperCase()}-${sequenceSeed}`,
    callsign,
    aircraft_type: stream.aircraftType,
    flight_phase: "arrival",
    latitude: position.latitude,
    longitude: position.longitude,
    heading_true_deg: headingToEntry,
    indicated_speed_kt: stream.speedKt,
    ground_speed_kt: stream.speedKt,
    altitude_ft: stream.altitudeFt,
    vertical_rate_fpm: stream.verticalRateFpm,
    route_mode: star ? "procedure" : "direct",
    next_fix: stream.entryFix,
    procedure_id: star?.id,
    procedure_name: star?.name,
    procedure_kind: star ? "STAR" : undefined,
    procedure_route: star ? route : undefined,
    procedure_route_index: star ? 0 : undefined,
    planned_entry_fix: stream.entryFix,
    guidance_active_at_ms: spawnedAtMs,
    heading_active_at_ms: spawnedAtMs,
    target_runway: stream.runway,
    assigned: {
      heading_true_deg: headingToEntry,
      speed_kt: stream.speedKt,
      altitude_ft: stream.altitudeFt,
      vertical_rate_fpm: stream.verticalRateFpm
    },
    speed_control_mode: "managed",
    altitude_control_mode: "controller",
    vertical_rate_control_mode: "controller",
    vertical_procedure_mode: star ? "cancel_level" : "controller",
    managed_speed_kt: stream.speedKt,
    owner_position: "APP",
    arrival_airport: "RKPC",
    squawk: squawkForSequence(sequenceSeed),
    scratchpad: [directToken, procedureToken].filter(Boolean).join(" "),
    scratchpad_auto_direct_token: directToken,
    scratchpad_auto_procedure_token: procedureToken,
    pilot_first_contact: isAppFirstContactEntryFix(stream.entryFix)
      ? arrivalFirstContactProfile(stream.entryFix, `${callsign}:${sequenceSeed}`)
      : undefined,
    frequency_state: isAppFirstContactEntryFix(stream.entryFix) ? "not_on_frequency" : "on_frequency",
    scenario_stream_id: stream.id,
    scenario_stream_role: "arrival_stream",
    remark: star ? `${stream.entryFix} continuous arrival stream ${star.name}` : `${stream.entryFix} conventional arrival stream`
  } satisfies AircraftState;
}

export function createDepartureWaveAircraft(
  dataset: RadarDataset,
  wave: DepartureWave,
  existingAircraft: AircraftState[],
  sequenceSeed: number,
  spawnedAtMs: number
) {
  const guidance = departureSidGuidanceForExitFix(dataset, wave.departureRunway, wave.exitFix);

  if (!guidance) {
    return null;
  }

  const callsign = nextUniqueCallsign(wave.callsignPrefix, existingAircraft, sequenceSeed);
  const procedureToken = "SID";
  const exitToken = directScratchpad(wave.exitFix);

  return {
    id: `DEP-${spawnedAtMs.toString(36).toUpperCase()}-${sequenceSeed}`,
    callsign,
    aircraft_type: wave.aircraftType,
    flight_phase: "departure",
    latitude: guidance.runway.threshold.latitude,
    longitude: guidance.runway.threshold.longitude,
    heading_true_deg: guidance.runway.true_bearing_deg,
    indicated_speed_kt: DEPARTURE_ROLL_INITIAL_SPEED_KT,
    ground_speed_kt: DEPARTURE_ROLL_INITIAL_SPEED_KT,
    altitude_ft: DEPARTURE_ROLL_INITIAL_ALTITUDE_FT,
    vertical_rate_fpm: 0,
    route_mode: "procedure",
    next_fix: guidance.firstFixId,
    procedure_id: guidance.sid.id,
    procedure_name: guidance.sid.name,
    procedure_kind: "SID",
    procedure_runtime_authority: guidance.sid.runtime_authority,
    procedure_motion_source: guidance.sid.motion_source,
    procedure_reference_overlay_role: guidance.sid.reference_overlay_role,
    procedure_exact_runtime_route_allowed: guidance.sid.exact_runtime_route_allowed,
    procedure_training_runtime_path_allowed: guidance.sid.training_runtime_path_allowed,
    procedure_route: guidance.route,
    procedure_route_index: 0,
    planned_exit_fix: normalizeFixId(wave.exitFix),
    guidance_active_at_ms: spawnedAtMs,
    heading_active_at_ms: spawnedAtMs,
    target_runway: wave.departureRunway,
    departure_runway: wave.departureRunway,
    departure_roll: departureRollStateForRunway(dataset, wave.departureRunway),
    assigned: {
      heading_true_deg: guidance.runway.true_bearing_deg,
      speed_kt: DEPARTURE_BELOW_10000_TARGET_SPEED_KT,
      altitude_ft: DEPARTURE_TARGET_ALTITUDE_FT,
      vertical_rate_fpm: wave.verticalRateFpm
    },
    speed_control_mode: "managed",
    altitude_control_mode: "managed",
    vertical_rate_control_mode: "managed",
    vertical_procedure_mode: "controller",
    managed_speed_kt: DEPARTURE_BELOW_10000_TARGET_SPEED_KT,
    owner_position: "DEP",
    destination_airport: wave.destinationAirport,
    squawk: squawkForSequence(sequenceSeed),
    scratchpad: [exitToken, procedureToken].filter(Boolean).join(" "),
    scratchpad_auto_direct_token: exitToken,
    scratchpad_auto_procedure_token: procedureToken,
    pilot_first_contact: departureFirstContactProfile(),
    frequency_state: "not_on_frequency",
    scenario_stream_id: wave.id,
    scenario_stream_role: "departure_wave",
    remark: `Departure wave ${wave.exitFix}, takeoff roll then SID climb`
  } satisfies AircraftState;
}

function routeIndexOfFix(route: string[], fixId: string) {
  const normalizedFixId = normalizeFixId(fixId);

  return route.findIndex((routeFixId) => normalizeFixId(routeFixId) === normalizedFixId);
}

export function arrivalStarGuidanceForFix(
  dataset: RadarDataset,
  stars: ProcedureRecord[],
  fixId: string,
  currentLatitude: number,
  currentLongitude: number
) {
  const normalizedFixId = normalizeFixId(fixId);
  const star = matchingStarIncludingFix(stars, normalizedFixId);

  if (!star) {
    return null;
  }

  const route = procedureRouteFromRecord(star, "STAR");
  const routeIndex = routeIndexOfFix(route, normalizedFixId);
  const firstTargetIndex = route[routeIndex + 1] ? routeIndex + 1 : routeIndex;
  const firstFixId = route[firstTargetIndex];
  const firstFix = firstFixId ? resolveDirectFix(dataset, firstFixId) : null;

  if (!firstFix || route.some((routeFixId) => !resolveDirectFix(dataset, routeFixId))) {
    return null;
  }

  return {
    star,
    route,
    routeIndex: firstTargetIndex,
    nextFixId: firstFixId,
    headingTrueDeg: initialBearingTrueDeg(
      currentLatitude,
      currentLongitude,
      firstFix.latitude,
      firstFix.longitude
    )
  };
}
