import type { ParsedAtcCommand } from "./atcCommandParser";
import {
  distanceNmBetweenPoints,
  initialBearingTrueDeg
} from "./aircraftMotion";
import {
  formatHeading,
  formatPanelAltitude,
  magneticToTrueHeading,
  trueToMagneticHeading,
  type AircraftControlForm
} from "./aircraftControlPanel";
import {
  aircraftWithAltitudeCommand,
  aircraftWithControllerSpeedPolicy,
  aircraftWithDirectToFixCommand,
  aircraftWithHeadingCommand,
  aircraftWithOneCircleHeadingCommand,
  aircraftWithVerticalRateCommand
} from "./aircraftCommandTransitions";
import {
  canExpediteClimb,
  canExpediteDescent,
  expediteClimb,
  expediteDescent,
  increaseVerticalRate,
  minimumSpeedCommandTargetKt,
  resumeNormalSpeed,
  resumeNormalVerticalMode
} from "./flightProfileGuidance";
import {
  headingScratchpadToken,
  mergeAtcControlScratchpadToken,
  speedScratchpadToken,
  type AtcControlScratchpadTokenKind
} from "./aircraftInteraction";
import {
  adHocHoldingPatternAtFix,
  adHocHoldingPatternAtPresentPosition,
  aircraftWithHoldingPatternCommand,
  holdingPatternForFix
} from "./holdingPatterns";
import { resolveDirectFix } from "./procedureGuidance";
import type {
  AircraftControllerSpeedPolicy,
  AircraftSpeedReleaseCondition,
  AircraftState,
  HoldingTurnDirection,
  RadarDataset
} from "./types";

const VISUAL_FINAL_CAPTURE_MAX_LATERAL_NM = 2.5;
const VISUAL_FINAL_CAPTURE_MAX_HEADING_DELTA_DEG = 60;
const VISUAL_FINAL_CAPTURE_MIN_THRESHOLD_DISTANCE_NM = 1.2;
const VISUAL_FINAL_CAPTURE_MAX_THRESHOLD_DISTANCE_NM = 14;

const VISUAL_APPROACH_FINAL_ROUTES: Record<string, { finalFixId: string; thresholdFixId: string }> = {
  "07": { finalFixId: "LIMSO", thresholdFixId: "RW070" },
  "25": { finalFixId: "TOKIN", thresholdFixId: "RW250" }
};

export type AtcCommandControlUpdates = Partial<
  Pick<AircraftControlForm, "heading" | "speed" | "altitude" | "verticalRate" | "scratchpad">
>;

export type AcceptedAtcCommandApplicationResult =
  | {
      status: "applied";
      aircraft: AircraftState;
      controlUpdates: AtcCommandControlUpdates;
    }
  | {
      status: "unable";
      detail: string;
    };

interface ApplyAcceptedAtcCommandArgs {
  aircraft: AircraftState;
  parsed: ParsedAtcCommand;
  dataset: RadarDataset;
  magneticVariationWestDeg: number;
  activeAtMs: number | undefined;
}

export function acceptedAtcCommandIntentIsSupported(parsed: ParsedAtcCommand) {
  return (
    parsed.intent === "MAINTAIN_PRESENT_HEADING" ||
    parsed.intent === "ASSIGN_HEADING" ||
    parsed.intent === "ONE_CIRCLE_HEADING" ||
    parsed.intent === "ASSIGN_SPEED" ||
    parsed.intent === "SPEED_UNTIL_FIX" ||
    parsed.intent === "SPEED_UNTIL_FIX_THEN_NORMAL" ||
    parsed.intent === "MAXIMUM_FORWARD_SPEED" ||
    parsed.intent === "MINIMUM_SPEED" ||
    parsed.intent === "MAINTAIN_SPEED_LIMIT" ||
    parsed.intent === "MAINTAIN_SPEED_UNTIL" ||
    parsed.intent === "ASSIGN_ALTITUDE" ||
    parsed.intent === "ASSIGN_VERTICAL_SPEED" ||
    parsed.intent === "INCREASE_DESCENT_RATE" ||
    parsed.intent === "INCREASE_CLIMB_RATE" ||
    parsed.intent === "RESUME_NORMAL_SPEED" ||
    parsed.intent === "RESUME_NORMAL_CLIMB" ||
    parsed.intent === "RESUME_NORMAL_DESCENT" ||
    parsed.intent === "DIRECT_TO_FIX" ||
    parsed.intent === "TURN_DIRECT_FIX" ||
    parsed.intent === "CROSS_FIX_RESTRICTION" ||
    parsed.intent === "CLEARED_VISUAL_APPROACH" ||
    parsed.intent === "EXPEDITE_DESCENT" ||
    parsed.intent === "EXPEDITE_CLIMB" ||
    parsed.intent === "HOLD_AT_FIX"
  );
}

export function applyAcceptedAtcCommandToAircraft({
  aircraft,
  parsed,
  dataset,
  magneticVariationWestDeg,
  activeAtMs
}: ApplyAcceptedAtcCommandArgs): AcceptedAtcCommandApplicationResult {
  if (parsed.intent === "MAINTAIN_PRESENT_HEADING") {
    const headingTrue = aircraft.heading_true_deg;
    const headingMag = trueToMagneticHeading(headingTrue, magneticVariationWestDeg);
    const nextAircraft = aircraftWithAtcScratchpadToken(
      aircraftWithHeadingCommand(aircraft, headingTrue, activeAtMs),
      "heading",
      headingScratchpadToken(headingMag)
    );

    return {
      status: "applied",
      aircraft: nextAircraft,
      controlUpdates: {
        heading: formatHeading(headingMag),
        scratchpad: nextAircraft.scratchpad ?? ""
      }
    };
  }

  if (parsed.intent === "ONE_CIRCLE_HEADING") {
    const headingMag = numberSlot(parsed, "heading_deg");
    const turnDirection = stringSlot(parsed, "turn_direction")?.toLowerCase();

    if (
      headingMag === null ||
      headingMag < 0 ||
      headingMag > 360 ||
      (turnDirection !== "left" && turnDirection !== "right")
    ) {
      return { status: "unable", detail: "invalid one-circle heading" };
    }

    const nextAircraft = aircraftWithAtcScratchpadToken(
      aircraftWithOneCircleHeadingCommand(
        aircraft,
        magneticToTrueHeading(headingMag, magneticVariationWestDeg),
        turnDirection,
        activeAtMs
      ),
      "heading",
      headingScratchpadToken(headingMag)
    );

    return {
      status: "applied",
      aircraft: nextAircraft,
      controlUpdates: {
        heading: formatHeading(headingMag),
        scratchpad: nextAircraft.scratchpad ?? ""
      }
    };
  }

  if (parsed.intent === "ASSIGN_HEADING") {
    const headingMag = numberSlot(parsed, "heading_deg");

    if (headingMag === null || headingMag < 0 || headingMag > 360) {
      return { status: "unable", detail: "invalid heading" };
    }

    const nextAircraft = aircraftWithAtcScratchpadToken(
      aircraftWithHeadingCommand(
        aircraft,
        magneticToTrueHeading(headingMag, magneticVariationWestDeg),
        activeAtMs
      ),
      "heading",
      headingScratchpadToken(headingMag)
    );

    return {
      status: "applied",
      aircraft: nextAircraft,
      controlUpdates: {
        heading: formatHeading(headingMag),
        scratchpad: nextAircraft.scratchpad ?? ""
      }
    };
  }

  if (
    parsed.intent === "ASSIGN_SPEED" ||
    parsed.intent === "SPEED_UNTIL_FIX" ||
    parsed.intent === "SPEED_UNTIL_FIX_THEN_NORMAL" ||
    parsed.intent === "MAXIMUM_FORWARD_SPEED" ||
    parsed.intent === "MINIMUM_SPEED" ||
    parsed.intent === "MAINTAIN_SPEED_LIMIT" ||
    parsed.intent === "MAINTAIN_SPEED_UNTIL"
  ) {
    const speed = numberSlot(parsed, "speed_kt");
    const speedPolicy = speedPolicyFromParsedCommand(parsed, dataset);

    if (!speedPolicy) {
      return { status: "unable", detail: "invalid speed" };
    }

    const displaySpeed = speed ?? speedPolicy.speed_kt;
    const nextAircraft = aircraftWithAtcScratchpadToken(
      aircraftWithControllerSpeedPolicy(aircraft, speedPolicy, activeAtMs),
      "speed",
      speedScratchpadToken(displaySpeed)
    );

    return {
      status: "applied",
      aircraft: nextAircraft,
      controlUpdates: {
        speed: String(displaySpeed),
        scratchpad: nextAircraft.scratchpad ?? ""
      }
    };
  }

  if (parsed.intent === "ASSIGN_ALTITUDE") {
    const altitude = numberSlot(parsed, "altitude_ft");

    if (altitude === null) {
      return { status: "unable", detail: "invalid altitude" };
    }

    return {
      status: "applied",
      aircraft: aircraftWithAltitudeCommand(aircraft, altitude, activeAtMs),
      controlUpdates: {
        altitude: formatPanelAltitude(altitude)
      }
    };
  }

  if (parsed.intent === "ASSIGN_VERTICAL_SPEED") {
    const verticalRate = numberSlot(parsed, "vertical_rate_fpm");

    if (verticalRate === null) {
      return { status: "unable", detail: "invalid vertical speed" };
    }

    return {
      status: "applied",
      aircraft: aircraftWithVerticalRateCommand(aircraft, verticalRate, activeAtMs),
      controlUpdates: {
        verticalRate: String(verticalRate)
      }
    };
  }

  if (parsed.intent === "INCREASE_DESCENT_RATE") {
    if (!canExpediteDescent(aircraft)) {
      return { status: "unable", detail: "aircraft has no descent target or active descent" };
    }

    return {
      status: "applied",
      aircraft: increaseVerticalRate(aircraft, dataset, "descent", activeAtMs),
      controlUpdates: {}
    };
  }

  if (parsed.intent === "INCREASE_CLIMB_RATE") {
    if (!canExpediteClimb(aircraft)) {
      return { status: "unable", detail: "aircraft has no climb target or active climb" };
    }

    return {
      status: "applied",
      aircraft: increaseVerticalRate(aircraft, dataset, "climb", activeAtMs),
      controlUpdates: {}
    };
  }

  if (parsed.intent === "RESUME_NORMAL_SPEED") {
    return {
      status: "applied",
      aircraft: resumeNormalSpeed(aircraft, dataset, activeAtMs),
      controlUpdates: {}
    };
  }

  if (parsed.intent === "RESUME_NORMAL_CLIMB" || parsed.intent === "RESUME_NORMAL_DESCENT") {
    return {
      status: "applied",
      aircraft: resumeNormalVerticalMode(
        aircraft,
        dataset,
        parsed.intent === "RESUME_NORMAL_CLIMB" ? "climb" : "descent",
        activeAtMs
      ),
      controlUpdates: {}
    };
  }

  if (parsed.intent === "DIRECT_TO_FIX" || parsed.intent === "TURN_DIRECT_FIX") {
    const fixId = stringSlot(parsed, "fix_id");
    const fix = fixId ? resolveDirectFix(dataset, fixId) : null;
    const altitude = numberSlot(parsed, "altitude_ft");

    if (!fixId || !fix) {
      return { status: "unable", detail: "unknown direct fix" };
    }

    const directAircraft = aircraftWithDirectToFixCommand(aircraft, fixId, fix, activeAtMs);
    const nextAircraft =
      typeof altitude === "number"
        ? aircraftWithAltitudeCommand(directAircraft, altitude, activeAtMs)
        : directAircraft;

    return {
      status: "applied",
      aircraft: nextAircraft,
      controlUpdates:
        typeof altitude === "number"
          ? {
              altitude: formatPanelAltitude(altitude),
              scratchpad: nextAircraft.scratchpad ?? ""
            }
          : {
              scratchpad: nextAircraft.scratchpad ?? ""
            }
    };
  }

  if (parsed.intent === "CROSS_FIX_RESTRICTION") {
    const fixId = stringSlot(parsed, "fix_id");
    const altitude = numberSlot(parsed, "altitude_ft");

    if (!fixId || altitude === null) {
      return { status: "unable", detail: "invalid crossing restriction" };
    }

    return {
      status: "applied",
      aircraft: {
        ...aircraft,
        altitude_control_mode: "managed",
        vertical_rate_control_mode: "managed",
        vertical_procedure_mode: "controller",
        execution_altitude_ft: altitude,
        execution_vertical_rate_fpm: undefined,
        managed_altitude_constraint_fix: fixId,
        managed_altitude_constraint_ft: altitude,
        pending_descent_altitude_ft: undefined,
        altitude_active_at_ms: activeAtMs,
        assigned: {
          ...aircraft.assigned,
          altitude_ft: altitude
        }
      },
      controlUpdates: {
        altitude: formatPanelAltitude(altitude)
      }
    };
  }

  if (parsed.intent === "HOLD_AT_FIX") {
    const presentPosition = parsed.slots.hold_at_present_position === true;
    const fixId = holdingFixIdFromParsedOrAircraft(parsed, aircraft);
    const fix = !presentPosition && fixId ? resolveDirectFix(dataset, fixId) : null;
    const basePattern = fixId ? holdingPatternForFix(fixId, aircraft) : null;
    const altitudeFt = numberSlot(parsed, "altitude_ft");
    const inboundHeadingMag = numberSlot(parsed, "inbound_heading_deg");
    const legTimeMin = numberSlot(parsed, "leg_time_minutes");
    const speedKt = numberSlot(parsed, "speed_kt");
    const turnDirection = holdingTurnDirectionSlot(parsed);

    if (!presentPosition && (!fixId || !fix)) {
      return { status: "unable", detail: "unknown holding fix" };
    }

    if (parsed.slots.hold_as_published && !basePattern) {
      return { status: "unable", detail: "no holding pattern data for fix" };
    }

    const inboundCourseTrueDeg =
      typeof inboundHeadingMag === "number"
        ? magneticToTrueHeading(inboundHeadingMag, magneticVariationWestDeg)
        : presentPosition
          ? aircraft.heading_true_deg
          : fix
            ? initialBearingTrueDeg(aircraft.latitude, aircraft.longitude, fix.latitude, fix.longitude)
            : aircraft.heading_true_deg;
    const pattern = parsed.slots.hold_as_published && basePattern
      ? basePattern
      : presentPosition
        ? adHocHoldingPatternAtPresentPosition({
            activeAtMs,
            aircraft,
            inboundCourseDeg: inboundCourseTrueDeg,
            ...(typeof legTimeMin === "number" ? { legTimeMin } : {}),
            ...(turnDirection ? { turnDirection } : {})
          })
        : adHocHoldingPatternAtFix({
            activeAtMs,
            aircraft,
            fix: fix!,
            fixId: fixId!,
            inboundCourseDeg: inboundCourseTrueDeg,
            ...(typeof legTimeMin === "number" ? { legTimeMin } : {}),
            ...(turnDirection ? { turnDirection } : {})
          });
    const holdAircraft = aircraftWithHoldingPatternCommand({
      activeAtMs,
      aircraft,
      ...(typeof altitudeFt === "number" ? { altitudeFt } : {}),
      pattern,
      ...(typeof speedKt === "number" ? { speedKt } : {}),
      startAtAnchor: presentPosition
    });

    return {
      status: "applied",
      aircraft: holdAircraft,
      controlUpdates: {
        ...(typeof altitudeFt === "number" ? { altitude: formatPanelAltitude(altitudeFt) } : {}),
        ...(typeof holdAircraft.assigned?.speed_kt === "number"
          ? { speed: String(Math.round(holdAircraft.assigned.speed_kt)) }
          : {})
      }
    };
  }

  if (parsed.intent === "CLEARED_VISUAL_APPROACH") {
    const runway = stringSlot(parsed, "runway")?.slice(0, 2);

    if (runway !== "07" && runway !== "25") {
      return { status: "unable", detail: "invalid visual approach runway" };
    }

    const visualFinalCapture = visualApproachFinalCaptureRoute({
      aircraft,
      dataset,
      runway
    });
    const nextAircraft: AircraftState = {
      ...aircraft,
      flight_phase: "arrival",
      route_mode: visualFinalCapture ? "procedure" : "vector",
      next_fix: visualFinalCapture?.thresholdFixId,
      procedure_id: `VISUAL_APPROACH_RWY_${runway}`,
      procedure_name: `Visual Approach RWY ${runway}`,
      procedure_kind: "APP",
      procedure_route: visualFinalCapture?.route,
      procedure_route_index: visualFinalCapture ? 1 : undefined,
      procedure_capture_transition: undefined,
      guidance_active_at_ms: visualFinalCapture ? activeAtMs : aircraft.guidance_active_at_ms,
      approach_phase: "final",
      target_runway: runway,
      scratchpad: "VIS",
      scratchpad_auto_direct_token: undefined,
      scratchpad_auto_procedure_token: "VIS"
    };

    return {
      status: "applied",
      aircraft: nextAircraft,
      controlUpdates: {
        scratchpad: nextAircraft.scratchpad ?? ""
      }
    };
  }

  if (parsed.intent === "EXPEDITE_DESCENT") {
    if (!canExpediteDescent(aircraft)) {
      return { status: "unable", detail: "aircraft has no descent target or active descent" };
    }

    return {
      status: "applied",
      aircraft: expediteDescent(aircraft, dataset, activeAtMs),
      controlUpdates: {}
    };
  }

  if (parsed.intent === "EXPEDITE_CLIMB") {
    if (!canExpediteClimb(aircraft)) {
      return { status: "unable", detail: "aircraft has no climb target or active climb" };
    }

    return {
      status: "applied",
      aircraft: expediteClimb(aircraft, dataset, activeAtMs),
      controlUpdates: {}
    };
  }

  return { status: "unable", detail: "multi-command adapter missing" };
}

function aircraftWithAtcScratchpadToken(
  aircraft: AircraftState,
  kind: AtcControlScratchpadTokenKind,
  token: string
): AircraftState {
  return {
    ...aircraft,
    scratchpad: mergeAtcControlScratchpadToken(aircraft.scratchpad ?? "", kind, token)
  };
}

export function speedPolicyFromParsedCommand(
  parsed: ParsedAtcCommand,
  dataset?: RadarDataset
): AircraftControllerSpeedPolicy | null {
  const speed = numberSlot(parsed, "speed_kt");

  if (parsed.intent === "MINIMUM_SPEED") {
    return {
      type: "minimum_practical",
      speed_kt: speed ?? (dataset ? minimumSpeedCommandTargetKt(dataset) : 155)
    };
  }

  if (speed === null) {
    return null;
  }

  if (parsed.intent === "MAINTAIN_SPEED_LIMIT") {
    return {
      type: parsed.slots.speed_limit_direction === "or_greater" ? "minimum" : "maximum",
      speed_kt: speed
    };
  }

  if (parsed.intent === "MAINTAIN_SPEED_UNTIL") {
    const releaseCondition =
      parsed.slots.release_condition &&
      typeof parsed.slots.release_condition === "object"
        ? parsed.slots.release_condition as AircraftSpeedReleaseCondition
        : undefined;

    return {
      type: "minimum",
      speed_kt: speed,
      ...(releaseCondition ? { release_condition: releaseCondition } : {})
    };
  }

  if (parsed.intent === "SPEED_UNTIL_FIX" || parsed.intent === "SPEED_UNTIL_FIX_THEN_NORMAL") {
    const releaseCondition =
      parsed.slots.release_condition &&
      typeof parsed.slots.release_condition === "object"
        ? parsed.slots.release_condition as AircraftSpeedReleaseCondition
        : undefined;

    return {
      type: "target",
      speed_kt: speed,
      ...(releaseCondition ? { release_condition: releaseCondition } : {})
    };
  }

  if (parsed.intent === "ASSIGN_SPEED" || parsed.intent === "MAXIMUM_FORWARD_SPEED") {
    return {
      type: "target",
      speed_kt: speed
    };
  }

  return null;
}

function visualApproachFinalCaptureRoute({
  aircraft,
  dataset,
  runway
}: {
  aircraft: AircraftState;
  dataset: RadarDataset;
  runway: string;
}) {
  const route = VISUAL_APPROACH_FINAL_ROUTES[runway];

  if (!route) {
    return null;
  }

  const finalFix = resolveDirectFix(dataset, route.finalFixId);
  const thresholdFix = resolveDirectFix(dataset, route.thresholdFixId);

  if (!finalFix || !thresholdFix) {
    return null;
  }

  const thresholdDistanceNm = distanceNmBetweenPoints(
    aircraft.latitude,
    aircraft.longitude,
    thresholdFix.latitude,
    thresholdFix.longitude
  );

  if (
    thresholdDistanceNm < VISUAL_FINAL_CAPTURE_MIN_THRESHOLD_DISTANCE_NM ||
    thresholdDistanceNm > VISUAL_FINAL_CAPTURE_MAX_THRESHOLD_DISTANCE_NM
  ) {
    return null;
  }

  const course = visualFinalCourseGeometry({
    aircraft,
    finalFix,
    thresholdFix
  });

  if (!course) {
    return null;
  }

  const headingDeltaDeg = Math.abs(shortestHeadingDeltaDeg(aircraft.heading_true_deg, course.courseTrueDeg));

  if (
    Math.abs(course.lateralNm) > VISUAL_FINAL_CAPTURE_MAX_LATERAL_NM ||
    headingDeltaDeg > VISUAL_FINAL_CAPTURE_MAX_HEADING_DELTA_DEG ||
    course.alongNm < -8 ||
    course.alongNm > course.courseLengthNm + 1
  ) {
    return null;
  }

  return {
    route: [route.finalFixId, route.thresholdFixId],
    finalFixId: route.finalFixId,
    thresholdFixId: route.thresholdFixId
  };
}

function visualFinalCourseGeometry({
  aircraft,
  finalFix,
  thresholdFix
}: {
  aircraft: AircraftState;
  finalFix: { latitude: number; longitude: number };
  thresholdFix: { latitude: number; longitude: number };
}) {
  const thresholdLocal = localNmFromOrigin(
    thresholdFix.latitude,
    thresholdFix.longitude,
    finalFix.latitude,
    finalFix.longitude
  );
  const currentLocal = localNmFromOrigin(
    aircraft.latitude,
    aircraft.longitude,
    finalFix.latitude,
    finalFix.longitude
  );
  const courseLengthNm = Math.hypot(thresholdLocal.x, thresholdLocal.y);

  if (courseLengthNm <= 0.05) {
    return null;
  }

  const unitX = thresholdLocal.x / courseLengthNm;
  const unitY = thresholdLocal.y / courseLengthNm;

  return {
    alongNm: currentLocal.x * unitX + currentLocal.y * unitY,
    lateralNm: currentLocal.x * -unitY + currentLocal.y * unitX,
    courseLengthNm,
    courseTrueDeg: initialBearingTrueDeg(
      finalFix.latitude,
      finalFix.longitude,
      thresholdFix.latitude,
      thresholdFix.longitude
    )
  };
}

function localNmFromOrigin(latitude: number, longitude: number, originLatitude: number, originLongitude: number) {
  const midLatitudeRad = ((latitude + originLatitude) / 2) * Math.PI / 180;

  return {
    x: (longitude - originLongitude) * 60 * Math.cos(midLatitudeRad),
    y: (latitude - originLatitude) * 60
  };
}

function shortestHeadingDeltaDeg(fromDeg: number, toDeg: number) {
  return ((((toDeg - fromDeg) % 360) + 540) % 360) - 180;
}

function numberSlot(parsed: ParsedAtcCommand, key: string) {
  const value = parsed.slots[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringSlot(parsed: ParsedAtcCommand, key: string) {
  const value = parsed.slots[key];

  return typeof value === "string" && value ? value : null;
}

function holdingTurnDirectionSlot(parsed: ParsedAtcCommand): HoldingTurnDirection | undefined {
  const value = stringSlot(parsed, "turn_direction")?.toLowerCase();

  return value === "left" || value === "right" ? value : undefined;
}

function holdingFixIdFromParsedOrAircraft(parsed: ParsedAtcCommand, aircraft: AircraftState) {
  return (
    stringSlot(parsed, "fix_id") ??
    aircraft.next_fix ??
    aircraft.procedure_route?.[aircraft.procedure_route_index ?? 0] ??
    aircraft.planned_entry_fix ??
    null
  );
}
