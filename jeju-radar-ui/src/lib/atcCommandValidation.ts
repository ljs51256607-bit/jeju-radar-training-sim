import type { ParsedAtcCommand } from "./atcCommandParser";
import {
  canExpediteClimb,
  canExpediteDescent,
  publishedSpeedRestrictionConflict
} from "./flightProfileGuidance";
import { holdingPatternForFix } from "./holdingPatterns";
import { normalizeProcedureFixId } from "./procedureRestrictionState";
import type {
  AircraftControllerSpeedPolicy,
  AircraftState,
  LevelRestrictionCancellationPolicy,
  ProcedureRecord,
  RadarDataset,
  SpeedRestrictionCancellationPolicy
} from "./types";

export type AtcCommandValidationStatus = "accepted" | "confirm" | "unable" | "say_again";

export interface AtcCommandValidationResult {
  status: AtcCommandValidationStatus;
  detail: string;
}

const GLOBAL_MAX_SPEED_KT = 310;
const BELOW_10000_SPEED_CAP_KT = 250;
const FALLBACK_MINIMUM_SPEED_COMMAND_TARGET_KT = 155;

type AtcValidationDataset = Pick<RadarDataset, "procedures"> &
  Partial<Pick<RadarDataset, "flightProfiles">> &
  Partial<Pick<RadarDataset, "geometry" | "videomapLabels">>;

export function validateAtcCommand(
  parsed: ParsedAtcCommand,
  aircraft: AircraftState,
  dataset: AtcValidationDataset
): AtcCommandValidationResult {
  if (!parsed.ok || !parsed.intent) {
    return sayAgain("no parser match");
  }

  if (parsed.slots.requires_confirmation) {
    return confirm(String(parsed.slots.confirmation_required_reason ?? "confirmation required"));
  }

  switch (parsed.intent) {
    case "MAINTAIN_PRESENT_HEADING":
      return accepted("present heading command accepted");
    case "ONE_CIRCLE_HEADING":
    case "ASSIGN_HEADING":
      return validateNumberSlot(parsed, "heading_deg", 0, 360, "invalid heading");
    case "SPEED_UNTIL_FIX":
    case "SPEED_UNTIL_FIX_THEN_NORMAL":
    case "ASSIGN_SPEED":
      return validateSpeedCommand(parsed, aircraft, dataset);
    case "MAXIMUM_FORWARD_SPEED":
      return validateSpeedCommand(parsed, aircraft, dataset);
    case "MINIMUM_SPEED":
      return validateMinimumSpeedCommand(parsed, aircraft, dataset);
    case "MAINTAIN_SPEED_LIMIT":
      return validateSpeedCommand(parsed, aircraft, dataset);
    case "MAINTAIN_SPEED_UNTIL":
      return validateSpeedCommand(parsed, aircraft, dataset);
    case "RESUME_NORMAL_SPEED":
    case "RESUME_NORMAL_CLIMB":
    case "RESUME_NORMAL_DESCENT":
      return accepted("resume command accepted");
    case "ASSIGN_ALTITUDE":
      return validateNumberSlot(parsed, "altitude_ft", 0, 60000, "invalid altitude");
    case "CROSS_FIX_RESTRICTION":
      return validateCrossFixRestriction(parsed, dataset);
    case "ASSIGN_VERTICAL_SPEED":
      return validateNumberSlot(parsed, "vertical_rate_fpm", -6000, 6000, "invalid vertical speed");
    case "INCREASE_DESCENT_RATE":
      return canExpediteDescent(aircraft)
        ? accepted("increase descent rate command accepted")
        : unable("aircraft has no descent target or active descent");
    case "INCREASE_CLIMB_RATE":
      return canExpediteClimb(aircraft)
        ? accepted("increase climb rate command accepted")
        : unable("aircraft has no climb target or active climb");
    case "DIRECT_TO_FIX":
    case "TURN_DIRECT_FIX":
      return validateDirectToFix(parsed, dataset);
    case "CLEARED_ILS":
      return validateIlsClearance(parsed, aircraft, dataset);
    case "CLEARED_VISUAL_APPROACH":
      return validateVisualApproachClearance(parsed, aircraft, dataset);
    case "DESCEND_VIA":
      return validateDescendVia(parsed, aircraft, dataset);
    case "CANCEL_LEVEL_RESTRICTION":
      return validateLevelRestrictionCancellation(parsed, aircraft);
    case "CANCEL_SPEED_RESTRICTION":
      return validateSpeedRestrictionCancellation(parsed, aircraft, dataset);
    case "AFFIRM":
    case "NEGATIVE":
      return accepted("confirmation response accepted");
    case "EXPEDITE_DESCENT":
      return canExpediteDescent(aircraft)
        ? accepted("expedite descent accepted")
        : unable("aircraft has no descent target or active descent");
    case "EXPEDITE_CLIMB":
      return canExpediteClimb(aircraft)
        ? accepted("expedite climb accepted")
        : unable("aircraft has no climb target or active climb");
    case "TRAFFIC_INFORMATION":
    case "ASK_INTENTIONS":
    case "SEQUENCE_NUMBER":
    case "CONFIRM_CALLSIGN":
    case "FIRST_CONTACT_ACK":
    case "RADIO_STANDBY":
      return accepted("readback-only command accepted");
    case "CONTACT_FREQUENCY":
      return validateContactFrequency(parsed);
    case "GO_AROUND":
    case "FLY_MISSED_APPROACH":
      return unable("go-around is a tower/scenario event, not an approach control command");
    case "HOLD_AT_FIX":
      return validateHoldAtFix(parsed, aircraft, dataset);
    default:
      return unable("intent parsed but engine adapter is not implemented yet");
  }
}

function validateSpeedCommand(
  parsed: ParsedAtcCommand,
  aircraft: AircraftState,
  dataset: AtcValidationDataset
): AtcCommandValidationResult {
  const speedValidation = validateNumberSlot(parsed, "speed_kt", 0, 600, "invalid speed");

  if (speedValidation.status !== "accepted") {
    return speedValidation;
  }

  const policy = speedPolicyFromParsedCommand(parsed);

  if (!policy) {
    return unable("missing speed policy");
  }

  if (
    (parsed.intent === "MAINTAIN_SPEED_UNTIL" ||
      parsed.intent === "SPEED_UNTIL_FIX" ||
      parsed.intent === "SPEED_UNTIL_FIX_THEN_NORMAL") &&
    !policy.release_condition
  ) {
    return unable("missing speed release condition");
  }

  if (policy.speed_kt > GLOBAL_MAX_SPEED_KT) {
    return unable("speed exceeds simulator maximum speed envelope");
  }

  if (
    aircraft.flight_phase !== "overflight" &&
    aircraft.altitude_ft <= 10000 &&
    policy.type !== "maximum" &&
    policy.speed_kt > BELOW_10000_SPEED_CAP_KT
  ) {
    return unable("speed conflicts with 10000ft/250kt hard cap");
  }

  const conflict = dataset.flightProfiles
    ? publishedSpeedRestrictionConflict(aircraft, dataset as RadarDataset, policy)
    : null;

  if (conflict?.requires_prompt) {
    return confirm(
      `confirm cancel speed restriction at ${conflict.fix_id} (${conflict.speed_cap_kt}kt cap, ${conflict.distance_nm.toFixed(1)}NM)`
    );
  }

  return accepted("speed command accepted");
}

function validateMinimumSpeedCommand(
  parsed: ParsedAtcCommand,
  aircraft: AircraftState,
  dataset: AtcValidationDataset
): AtcCommandValidationResult {
  const policy = speedPolicyFromParsedCommand(parsed, dataset);

  if (!policy || policy.type !== "minimum_practical") {
    return unable("missing minimum speed policy");
  }

  if (aircraft.flight_phase !== "arrival") {
    return unable("minimum speed is only valid for arrival aircraft");
  }

  if (policy.speed_kt <= 0 || policy.speed_kt > GLOBAL_MAX_SPEED_KT) {
    return unable("minimum speed target is outside simulator speed envelope");
  }

  return accepted("minimum speed command accepted");
}

function validateDirectToFix(
  parsed: ParsedAtcCommand,
  dataset: AtcValidationDataset
): AtcCommandValidationResult {
  const fixId = stringSlot(parsed, "fix_id");
  const altitudeValidation = validateOptionalNumberSlot(
    parsed,
    "altitude_ft",
    0,
    60000,
    "invalid altitude"
  );

  if (altitudeValidation.status !== "accepted") {
    return altitudeValidation;
  }

  if (!fixId || !knownFixExists(dataset, fixId)) {
    return sayAgain("unknown direct fix");
  }

  return accepted("direct-to-fix accepted");
}

function validateCrossFixRestriction(
  parsed: ParsedAtcCommand,
  dataset: AtcValidationDataset
): AtcCommandValidationResult {
  const fixId = stringSlot(parsed, "fix_id");
  const altitudeValidation = validateNumberSlot(parsed, "altitude_ft", 0, 60000, "invalid crossing altitude");

  if (altitudeValidation.status !== "accepted") {
    return altitudeValidation;
  }

  if (!fixId || !knownFixExists(dataset, fixId)) {
    return sayAgain("unknown crossing fix");
  }

  return accepted("crossing restriction accepted");
}

function validateHoldAtFix(
  parsed: ParsedAtcCommand,
  aircraft: AircraftState,
  dataset: AtcValidationDataset
): AtcCommandValidationResult {
  const presentPosition = parsed.slots.hold_at_present_position === true;
  const fixId = holdingFixIdFromParsedOrAircraft(parsed, aircraft);
  const altitudeValidation = validateOptionalNumberSlot(
    parsed,
    "altitude_ft",
    0,
    60000,
    "invalid holding altitude"
  );

  if (altitudeValidation.status !== "accepted") {
    return altitudeValidation;
  }

  if (!presentPosition && (!fixId || !knownFixExists(dataset, fixId))) {
    return sayAgain("unknown holding fix");
  }

  const pattern = fixId ? holdingPatternForFix(fixId, aircraft) : null;

  if (parsed.slots.hold_as_published && !pattern) {
    return unable("no holding pattern data for fix");
  }

  const inboundHeadingValidation = validateOptionalNumberSlot(
    parsed,
    "inbound_heading_deg",
    0,
    360,
    "invalid inbound heading"
  );

  if (inboundHeadingValidation.status !== "accepted") {
    return inboundHeadingValidation;
  }

  const legTimeMin = numberSlot(parsed, "leg_time_minutes");

  if (legTimeMin !== null && (legTimeMin < 0.5 || legTimeMin > 3)) {
    return unable("holding leg time outside simulator envelope");
  }

  const speedValidation = validateOptionalNumberSlot(
    parsed,
    "speed_kt",
    0,
    GLOBAL_MAX_SPEED_KT,
    "invalid holding speed"
  );

  if (speedValidation.status !== "accepted") {
    return speedValidation;
  }

  return accepted(parsed.slots.hold_as_published ? "published holding command accepted" : "holding command accepted");
}

function validateIlsClearance(
  parsed: ParsedAtcCommand,
  aircraft: AircraftState,
  dataset: AtcValidationDataset
): AtcCommandValidationResult {
  const runway = stringSlot(parsed, "runway")?.slice(0, 2);

  if (runway !== "07" && runway !== "25") {
    return unable(`ILS runway ${runway ?? "unknown"} not available`);
  }

  const ilsProcedure = dataset.procedures.approaches.find((procedure) =>
    procedureMatchesIlsRunway(procedure, runway)
  );

  if (!ilsProcedure) {
    return unable(`ILS runway ${runway} not available`);
  }

  if (aircraft.flight_phase !== "arrival" || aircraft.owner_position === "DEP") {
    return unable("aircraft is not an approach arrival");
  }

  return accepted("ILS clearance accepted");
}

function validateVisualApproachClearance(
  parsed: ParsedAtcCommand,
  aircraft: AircraftState,
  dataset: AtcValidationDataset
): AtcCommandValidationResult {
  const runway = stringSlot(parsed, "runway")?.slice(0, 2);

  if (runway !== "07" && runway !== "25") {
    return unable(`visual approach runway ${runway ?? "unknown"} not available`);
  }

  if (aircraft.flight_phase !== "arrival" || aircraft.owner_position === "DEP") {
    return unable("aircraft is not an approach arrival");
  }

  const visualRules = dataset.procedures.visual_approach_rules ?? [];
  const hasGeneralRule = visualRules.some((rule) => {
    const candidate = rule as { id?: unknown; runway?: unknown };

    return (
      candidate.id === "VISUAL_APPROACH_AIP_GENERAL" ||
      candidate.runway === runway ||
      candidate.runway === "ALL"
    );
  });
  const hasRunwayRule = visualRules.some((rule) => {
    const candidate = rule as { id?: unknown; runway?: unknown };

    return candidate.runway === runway || String(candidate.id ?? "").includes(`RWY${runway}`);
  });

  if (!hasGeneralRule && !hasRunwayRule) {
    return unable(`visual approach runway ${runway} rule not available`);
  }

  return accepted("visual approach clearance accepted");
}

function validateDescendVia(
  parsed: ParsedAtcCommand,
  aircraft: AircraftState,
  dataset: AtcValidationDataset
): AtcCommandValidationResult {
  const altitudeValidation = validateOptionalNumberSlot(
    parsed,
    "altitude_ft",
    0,
    60000,
    "invalid altitude"
  );

  if (altitudeValidation.status !== "accepted") {
    return altitudeValidation;
  }

  const star = starForParsedDescendVia(parsed, dataset.procedures.stars);

  if (!star && aircraft.procedure_kind !== "STAR") {
    return unable("STAR procedure is not active and requested STAR could not be resolved");
  }

  if (aircraft.flight_phase !== "arrival") {
    return unable("descend via is only valid for arrival aircraft");
  }

  return accepted("descend-via accepted");
}

function validateLevelRestrictionCancellation(
  parsed: ParsedAtcCommand,
  aircraft: AircraftState
): AtcCommandValidationResult {
  const policy = parsed.slots.cancel_level_restriction as LevelRestrictionCancellationPolicy | undefined;

  if (!policy) {
    return unable("missing cancellation policy");
  }

  if ((policy.requires_confirmation || policy.scope === "APP_ALL") && aircraft.procedure_kind === "STAR") {
    return accepted("STAR level restriction cancellation accepted");
  }

  if (policy.requires_confirmation || policy.scope === "APP_ALL") {
    return confirm("missing approach fix scope");
  }

  if (policy.scope === "STAR") {
    return aircraft.procedure_kind === "STAR"
      ? accepted("STAR level restriction cancellation accepted")
      : unable("aircraft is not on a STAR");
  }

  if (policy.scope !== "APP_FIX") {
    return unable("unsupported level restriction cancellation scope");
  }

  if (!policy.fix_id) {
    return unable("APP_FIX cancellation requires fix_id");
  }

  if (aircraft.procedure_kind !== "APP" || aircraft.route_mode !== "procedure") {
    return unable("aircraft is not on an approach procedure");
  }

  const normalizedFixId = normalizeProcedureFixId(policy.fix_id);
  const route = aircraft.procedure_route?.map(normalizeProcedureFixId) ?? [];

  if (!route.includes(normalizedFixId)) {
    return unable("fix is not on active approach route");
  }

  return accepted("approach fix level restriction cancellation accepted");
}

function validateSpeedRestrictionCancellation(
  parsed: ParsedAtcCommand,
  aircraft: AircraftState,
  dataset: AtcValidationDataset
): AtcCommandValidationResult {
  const policy = parsed.slots.cancel_speed_restriction as SpeedRestrictionCancellationPolicy | undefined;

  if (!policy) {
    return unable("missing speed restriction cancellation policy");
  }

  const fixId = policy.fix_id;
  const activeConflict = dataset.flightProfiles
    ? publishedSpeedRestrictionConflict(aircraft, dataset as RadarDataset)
    : null;

  if (fixId) {
    const route = aircraft.procedure_route?.map(normalizeProcedureFixId) ?? [];

    if (aircraft.route_mode !== "procedure" || !route.includes(normalizeProcedureFixId(fixId))) {
      return unable("fix is not on active procedure route");
    }

    return accepted("speed restriction cancellation accepted");
  }

  if (activeConflict) {
    return accepted("active speed restriction cancellation accepted");
  }

  return confirm("missing speed restriction fix scope");
}

function validateNumberSlot(
  parsed: ParsedAtcCommand,
  key: string,
  min: number,
  max: number,
  detail: string
): AtcCommandValidationResult {
  const value = numberSlot(parsed, key);

  if (value === null || value < min || value > max) {
    return unable(detail);
  }

  return accepted(`${key} accepted`);
}

function validateContactFrequency(parsed: ParsedAtcCommand): AtcCommandValidationResult {
  const frequencyText = typeof parsed.slots.frequency_mhz === "string"
    ? parsed.slots.frequency_mhz
    : "";
  const frequency = Number.parseFloat(frequencyText);

  if (!Number.isFinite(frequency) || frequency < 118 || frequency > 136.975) {
    return unable("frequency outside VHF communication range");
  }

  const facility = String(parsed.slots.facility ?? "").toUpperCase();
  if ((facility === "TOWER" || facility === "JEJU TOWER") && frequencyText !== "118.2") {
    return unable("Jeju tower frequency is 118.2");
  }

  return accepted("frequency contact readback accepted");
}

function validateOptionalNumberSlot(
  parsed: ParsedAtcCommand,
  key: string,
  min: number,
  max: number,
  detail: string
): AtcCommandValidationResult {
  if (!(key in parsed.slots)) {
    return accepted(`${key} omitted`);
  }

  return validateNumberSlot(parsed, key, min, max, detail);
}

function numberSlot(parsed: ParsedAtcCommand, key: string) {
  const value = parsed.slots[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringSlot(parsed: ParsedAtcCommand, key: string) {
  const value = parsed.slots[key];

  return typeof value === "string" && value ? value : null;
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

function minimumSpeedCommandTargetForDataset(dataset: AtcValidationDataset) {
  const profile = dataset.flightProfiles
    ? dataset.flightProfiles.profiles.find(
        (candidate) => candidate.id === dataset.flightProfiles?.default_profile_id
      ) ?? dataset.flightProfiles.profiles[0]
    : undefined;
  const targetSpeedKt = profile?.arrival.minimum_speed_command?.target_speed_kt;

  return typeof targetSpeedKt === "number" && Number.isFinite(targetSpeedKt)
    ? targetSpeedKt
    : FALLBACK_MINIMUM_SPEED_COMMAND_TARGET_KT;
}

function knownFixExists(dataset: AtcValidationDataset, fixId: string) {
  const normalizedFixId = normalizeProcedureFixId(fixId);

  return (
    dataset.procedures.fixes.some((fix) => normalizeProcedureFixId(fix.id) === normalizedFixId) ||
    Boolean(
      dataset.videomapLabels?.labels.some((label) =>
        normalizeProcedureFixId(label.text) === normalizedFixId
      )
    ) ||
    Boolean(
      dataset.geometry?.reference_points.some((point) =>
        normalizeProcedureFixId(point.id) === normalizedFixId
      )
    )
  );
}

function procedureMatchesIlsRunway(procedure: ProcedureRecord, runway: "07" | "25") {
  const id = normalizeProcedureFixId(procedure.id);
  const name = normalizeProcedureFixId(procedure.name);
  const approachType = normalizeProcedureFixId(procedure.approach_type ?? "");

  return (
    procedure.runway === runway &&
    (id.includes("ILS") || name.includes("ILS") || approachType.includes("ILS"))
  );
}

function starForParsedDescendVia(parsed: ParsedAtcCommand, stars: ProcedureRecord[]) {
  const fixId = stringSlot(parsed, "fix_id");
  const compactProcedure =
    stringSlot(parsed, "procedure_compact") ??
    compactProcedureFromWords(
      stringSlot(parsed, "procedure_number_word"),
      stringSlot(parsed, "procedure_suffix_word")
    );
  const procedureId = stringSlot(parsed, "procedure_id");

  if (procedureId) {
    const normalizedProcedureId = normalizeProcedureFixId(procedureId).replace(/\s+/g, "_");
    const directMatch = stars.find((procedure) => {
      const id = normalizeProcedureFixId(procedure.id);
      const name = normalizeProcedureFixId(procedure.name).replace(/\s+/g, "_");

      return id.includes(normalizedProcedureId) || name.includes(normalizedProcedureId);
    });

    if (directMatch) {
      return directMatch;
    }
  }

  if (!fixId && !compactProcedure) {
    return null;
  }

  return (
    stars.find((procedure) => {
      const id = normalizeProcedureFixId(procedure.id);
      const name = normalizeProcedureFixId(procedure.name);
      const route = procedureRouteFromRecord(procedure);
      const matchesFix = !fixId || route.includes(fixId) || id.includes(fixId) || name.includes(fixId);
      const matchesProcedure =
        !compactProcedure || id.includes(compactProcedure) || name.includes(compactProcedure);

      return matchesFix && matchesProcedure;
    }) ?? null
  );
}

function compactProcedureFromWords(numberWord: string | null, suffixWord: string | null) {
  if (!numberWord || !suffixWord) {
    return null;
  }

  const number = procedureNumberWordToDigit(numberWord);
  const suffix = procedureSuffixWordToLetter(suffixWord);

  return number && suffix ? `${number}${suffix}` : null;
}

function procedureNumberWordToDigit(value: string) {
  const map: Record<string, string> = {
    ONE: "1",
    TWO: "2",
    THREE: "3",
    FOUR: "4",
    FIVE: "5",
    SIX: "6",
    SEVEN: "7",
    EIGHT: "8",
    NINE: "9"
  };

  return map[value] ?? null;
}

function procedureSuffixWordToLetter(value: string) {
  const map: Record<string, string> = {
    PAPA: "P",
    MIKE: "M",
    ECHO: "E",
    WHISKEY: "W",
    NOVEMBER: "N",
    KILO: "K",
    LIMA: "L",
    YANKEE: "Y",
    ZULU: "Z"
  };

  return map[value] ?? null;
}

function procedureRouteFromRecord(procedure: ProcedureRecord) {
  const routeFromText = parseProcedureRouteText(procedure.route_text);

  if (routeFromText.length > 0) {
    return routeFromText;
  }

  return [...(procedure.initial_fixes ?? []), ...(procedure.final_fixes ?? [])].map(
    normalizeProcedureFixId
  );
}

function parseProcedureRouteText(routeText?: string) {
  if (!routeText) {
    return [];
  }

  return routeText
    .split("-")
    .map((routePart) => normalizeProcedureFixId(routePart))
    .filter((routePart) => routePart && !/^\d/.test(routePart) && !/\bFT\b/.test(routePart));
}

function accepted(detail: string): AtcCommandValidationResult {
  return { status: "accepted", detail };
}

function confirm(detail: string): AtcCommandValidationResult {
  return { status: "confirm", detail };
}

function unable(detail: string): AtcCommandValidationResult {
  return { status: "unable", detail };
}

function sayAgain(detail: string): AtcCommandValidationResult {
  return { status: "say_again", detail };
}

function speedPolicyFromParsedCommand(
  parsed: ParsedAtcCommand,
  dataset?: AtcValidationDataset
): AircraftControllerSpeedPolicy | null {
  const speedKt = numberSlot(parsed, "speed_kt");

  if (parsed.intent === "MINIMUM_SPEED") {
    return {
      type: "minimum_practical",
      speed_kt: speedKt ?? (dataset ? minimumSpeedCommandTargetForDataset(dataset) : FALLBACK_MINIMUM_SPEED_COMMAND_TARGET_KT)
    };
  }

  if (speedKt === null) {
    return null;
  }

  if (parsed.intent === "MAINTAIN_SPEED_LIMIT") {
    return {
      type: parsed.slots.speed_limit_direction === "or_greater" ? "minimum" : "maximum",
      speed_kt: speedKt
    };
  }

  if (parsed.intent === "MAINTAIN_SPEED_UNTIL") {
    const releaseCondition = parsed.slots.release_condition;

    return {
      type: "minimum",
      speed_kt: speedKt,
      ...(releaseCondition && typeof releaseCondition === "object"
        ? { release_condition: releaseCondition as AircraftControllerSpeedPolicy["release_condition"] }
        : {})
    };
  }

  if (parsed.intent === "SPEED_UNTIL_FIX" || parsed.intent === "SPEED_UNTIL_FIX_THEN_NORMAL") {
    const releaseCondition = parsed.slots.release_condition;

    return {
      type: "target",
      speed_kt: speedKt,
      ...(releaseCondition && typeof releaseCondition === "object"
        ? { release_condition: releaseCondition as AircraftControllerSpeedPolicy["release_condition"] }
        : {})
    };
  }

  return {
    type: "target",
    speed_kt: speedKt
  };
}
