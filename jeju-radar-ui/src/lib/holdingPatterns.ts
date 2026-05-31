import type {
  AircraftState,
  HoldingEntryType,
  HoldingPattern,
  HoldingPhase,
  HoldingTurnDirection,
  RadarDataset
} from "./types";

export const HOLDING_FIX_CAPTURE_DISTANCE_NM = 0.35;
export const HOLDING_TURN_CAPTURE_HEADING_DEG = 8;
export const DEFAULT_ATC_HOLD_LEG_TIME_MIN = 1;
export const DEFAULT_ATC_HOLD_SPEED_KT = 230;
export const PRESENT_POSITION_HOLD_FIX_ID = "PPOS";
export const DEFAULT_PRESENT_POSITION_HOLD_EXTRA_DELAY_MS = 0;

export const PUBLISHED_HOLDING_PATTERNS: HoldingPattern[] = [
  {
    id: "HOLD_STAR_RNAV_DOTOL_2P_MANBA",
    kind: "star",
    fix_id: "MANBA",
    inbound_course_deg: 38.9,
    turn_direction: "left",
    leg_time_min: 1.5,
    min_altitude_ft: 9000,
    max_altitude_ft: 13000,
    max_speed_kt: 250,
    procedure_id: "RNAV_DOTOL_2P",
    runway: "07",
    source:
      "RKPC STAR HM row: MANBA course 047M(038.9T), 1.5 min, left turns, +9000/-13000, max 250 kt",
    notes: ["Inbound course uses AIP HM row true course, not STAR route-leg course."]
  },
  {
    id: "HOLD_STAR_RNAV_DOTOL_2P_YUMIN",
    kind: "star",
    fix_id: "YUMIN",
    inbound_course_deg: 118.3,
    turn_direction: "left",
    leg_time_min: 1,
    min_altitude_ft: 4000,
    max_altitude_ft: 7000,
    max_speed_kt: 230,
    procedure_id: "RNAV_DOTOL_2P",
    runway: "07",
    source:
      "RKPC STAR HM row: YUMIN course 126M(118.3T), 1.0 min, left turns, +4000/-7000, max 230 kt",
    notes: ["Inbound course uses AIP HM row true course, not STAR route-leg course."]
  },
  {
    id: "HOLD_STAR_RNAV_TAMNA_2P_CJU",
    kind: "star",
    fix_id: "CJU",
    inbound_course_deg: 261.9,
    turn_direction: "left",
    leg_time_min: 1.5,
    min_altitude_ft: 12000,
    max_altitude_ft: 16000,
    max_speed_kt: 250,
    procedure_id: "RNAV_TAMNA_2P",
    runway: "07",
    source:
      "RKPC STAR HM row: CJU course 269M(261.9T), 1.5 min, left turns, +12000/-FL160, max 250 kt",
    notes: ["Inbound course uses AIP HM row true course."]
  },
  {
    id: "HOLD_MISSED_ILS_Z_RWY_07_PETAA",
    kind: "missed",
    fix_id: "PETAA",
    inbound_course_deg: 268.2,
    turn_direction: "right",
    leg_time_min: 1,
    min_altitude_ft: 8000,
    max_altitude_ft: 9000,
    max_speed_kt: 230,
    procedure_id: "MISSED_APPROACH_ILS_Z_RWY_07",
    runway: "07",
    source:
      "RKPC APCH HM row: PETAA course 276M(268.2T), 1.0 min, right turns, +8000/-9000, max 230 kt",
    notes: ["Inbound course uses AIP HM row true course."]
  },
  {
    id: "HOLD_MISSED_ILS_Z_RWY_25_LOTKA",
    kind: "missed",
    fix_id: "LOTKA",
    inbound_course_deg: 63.2,
    turn_direction: "left",
    leg_time_min: 1,
    min_altitude_ft: 6000,
    max_altitude_ft: 11000,
    max_speed_kt: 210,
    procedure_id: "MISSED_APPROACH_ILS_Z_RWY_25",
    runway: "25",
    source:
      "RKPC APCH HM row: LOTKA course 071M(063.2T), 1.0 min, left turns, +6000/-11000, max 210 kt",
    notes: ["Inbound course uses AIP HM row true course."]
  }
];

export function normalizeHoldingFixId(fixId: string) {
  return fixId.trim().toUpperCase();
}

export function normalizeHeadingDeg(headingDeg: number) {
  return ((headingDeg % 360) + 360) % 360;
}

export function shortestHeadingDelta(fromHeadingDeg: number, toHeadingDeg: number) {
  return (
    (((normalizeHeadingDeg(toHeadingDeg) - normalizeHeadingDeg(fromHeadingDeg) + 540) % 360) + 360) %
      360
  ) - 180;
}

export function holdingPatternsForRunway(runway: "07" | "25") {
  return PUBLISHED_HOLDING_PATTERNS.filter((pattern) => !pattern.runway || pattern.runway === runway);
}

export function holdingPatternForId(patternId: string | undefined) {
  const normalizedPatternId = normalizeHoldingFixId(patternId ?? "");

  return PUBLISHED_HOLDING_PATTERNS.find(
    (pattern) => normalizeHoldingFixId(pattern.id) === normalizedPatternId
  ) ?? null;
}

export function holdingPatternsForFix(fixId: string) {
  const normalizedFixId = normalizeHoldingFixId(fixId);

  return PUBLISHED_HOLDING_PATTERNS.filter(
    (pattern) => normalizeHoldingFixId(pattern.fix_id) === normalizedFixId
  );
}

export function holdingPatternForFix(
  fixId: string,
  aircraft?: AircraftState
): HoldingPattern | null {
  const patterns = holdingPatternsForFix(fixId);

  if (patterns.length === 0) {
    return null;
  }

  const activeProcedureId = normalizeHoldingFixId(aircraft?.procedure_id ?? "");
  const exactProcedureMatch = patterns.find(
    (pattern) =>
      pattern.procedure_id &&
      (activeProcedureId === normalizeHoldingFixId(pattern.procedure_id) ||
        activeProcedureId.includes(normalizeHoldingFixId(pattern.procedure_id)))
  );

  if (exactProcedureMatch) {
    return exactProcedureMatch;
  }

  const activeRunway = aircraft?.target_runway;
  const runwayMatch = patterns.find((pattern) => pattern.runway && pattern.runway === activeRunway);

  return runwayMatch ?? patterns[0];
}

export function holdingPatternForAircraft(aircraft: AircraftState): HoldingPattern | null {
  if (aircraft.holding_pattern) {
    return aircraft.holding_pattern;
  }

  if (aircraft.holding_state?.pattern_id) {
    return holdingPatternForId(aircraft.holding_state.pattern_id);
  }

  return aircraft.next_fix ? holdingPatternForFix(aircraft.next_fix, aircraft) : null;
}

export function resolveHoldingFix(dataset: RadarDataset, fixId: string) {
  const normalizedFixId = normalizeHoldingFixId(fixId);
  const procedureFix = dataset.procedures.fixes.find(
    (fix) => normalizeHoldingFixId(fix.id) === normalizedFixId
  );

  if (procedureFix) {
    return {
      id: procedureFix.id,
      latitude: procedureFix.latitude,
      longitude: procedureFix.longitude
    };
  }

  const labelFix = dataset.videomapLabels.labels.find(
    (label) => normalizeHoldingFixId(label.text) === normalizedFixId
  );

  if (labelFix) {
    return {
      id: labelFix.text,
      latitude: labelFix.latitude,
      longitude: labelFix.longitude
    };
  }

  return null;
}

export function holdingEntryType({
  aircraftHeadingTrueDeg,
  inboundCourseDeg,
  turnDirection
}: {
  aircraftHeadingTrueDeg: number;
  inboundCourseDeg: number;
  turnDirection: HoldingTurnDirection;
}): HoldingEntryType {
  const relativeToInbound = shortestHeadingDelta(inboundCourseDeg, aircraftHeadingTrueDeg);

  if (turnDirection === "right") {
    if (relativeToInbound >= -70 && relativeToInbound <= 110) {
      return "direct";
    }

    return relativeToInbound < -70 ? "teardrop" : "parallel";
  }

  if (relativeToInbound >= -110 && relativeToInbound <= 70) {
    return "direct";
  }

  return relativeToInbound > 70 ? "teardrop" : "parallel";
}

export function initialHoldingPhaseForEntry(entryType: HoldingEntryType): HoldingPhase {
  if (entryType === "parallel") {
    return "entry_parallel_outbound";
  }

  if (entryType === "teardrop") {
    return "entry_teardrop_outbound";
  }

  return "outbound";
}

export function holdingStateAtFix({
  aircraftHeadingTrueDeg,
  currentTimeMs,
  pattern
}: {
  aircraftHeadingTrueDeg: number;
  currentTimeMs: number;
  pattern: HoldingPattern;
}) {
  const entryType = holdingEntryType({
    aircraftHeadingTrueDeg,
    inboundCourseDeg: pattern.inbound_course_deg,
    turnDirection: pattern.turn_direction
  });

  return {
    pattern_id: pattern.id,
    fix_id: pattern.fix_id,
    entry_type: entryType,
    phase: initialHoldingPhaseForEntry(entryType),
    inbound_course_deg: pattern.inbound_course_deg,
    turn_direction: pattern.turn_direction,
    leg_time_min: pattern.leg_time_min,
    phase_started_at_ms: currentTimeMs,
    entry_initial_heading_deg: normalizeHeadingDeg(aircraftHeadingTrueDeg),
    entry_target_heading_deg: holdingEntryTargetHeading(pattern, entryType),
    ...(entryType === "direct" ? { established_at_ms: currentTimeMs } : {})
  };
}

export function entryToFixHoldingState(pattern: HoldingPattern, currentTimeMs: number) {
  return {
    pattern_id: pattern.id,
    fix_id: pattern.fix_id,
    entry_type: "direct" as const,
    phase: "entry_to_fix" as const,
    inbound_course_deg: pattern.inbound_course_deg,
    turn_direction: pattern.turn_direction,
    leg_time_min: pattern.leg_time_min,
    phase_started_at_ms: currentTimeMs
  };
}

export function holdingPhaseDurationMs(phase: HoldingPhase, legTimeMin: number) {
  if (
    phase === "outbound" ||
    phase === "entry_parallel_outbound" ||
    phase === "entry_teardrop_outbound"
  ) {
    return Math.max(0.2, legTimeMin) * 60_000;
  }

  return 0;
}

export function holdingOutboundHeading(pattern: Pick<HoldingPattern, "inbound_course_deg">) {
  return normalizeHeadingDeg(pattern.inbound_course_deg + 180);
}

export function holdingTeardropHeading(pattern: Pick<HoldingPattern, "inbound_course_deg" | "turn_direction">) {
  const outboundHeading = holdingOutboundHeading(pattern);
  const offset = pattern.turn_direction === "right" ? -30 : 30;

  return normalizeHeadingDeg(outboundHeading + offset);
}

export function holdingEntryTargetHeading(
  pattern: Pick<HoldingPattern, "inbound_course_deg" | "turn_direction">,
  entryType: HoldingEntryType
) {
  return entryType === "teardrop"
    ? holdingTeardropHeading(pattern)
    : holdingOutboundHeading(pattern);
}

export function nextHoldingTimedPhase(
  phase: HoldingPhase,
  currentHeadingTrueDeg: number,
  inboundCourseDeg: number
): HoldingPhase {
  if (phase === "entry_parallel_outbound" || phase === "entry_teardrop_outbound") {
    return "turn_inbound";
  }

  if (phase === "outbound") {
    return "turn_inbound";
  }

  if (
    phase === "turn_inbound" &&
    Math.abs(shortestHeadingDelta(currentHeadingTrueDeg, inboundCourseDeg)) <=
      HOLDING_TURN_CAPTURE_HEADING_DEG
  ) {
    return "inbound";
  }

  return phase;
}

export function holdingPatternWithInstructionOverrides({
  altitudeFt,
  basePattern,
  legTimeMin,
  turnDirection
}: {
  altitudeFt?: number;
  basePattern: HoldingPattern;
  legTimeMin?: number;
  turnDirection?: HoldingTurnDirection;
}): HoldingPattern {
  const turnOverridden = Boolean(turnDirection && turnDirection !== basePattern.turn_direction);
  const legOverridden = Boolean(
    typeof legTimeMin === "number" &&
      Number.isFinite(legTimeMin) &&
      legTimeMin > 0 &&
      legTimeMin !== basePattern.leg_time_min
  );

  return {
    ...basePattern,
    id: [
      basePattern.id,
      turnOverridden ? turnDirection?.toUpperCase() : "",
      legOverridden ? `${legTimeMin}MIN` : ""
    ]
      .filter(Boolean)
      .join("_"),
    kind: turnOverridden || legOverridden ? "atc" : basePattern.kind,
    turn_direction: turnDirection ?? basePattern.turn_direction,
    leg_time_min:
      typeof legTimeMin === "number" && Number.isFinite(legTimeMin) && legTimeMin > 0
        ? legTimeMin
        : basePattern.leg_time_min,
    notes: [
      ...(basePattern.notes ?? []),
      ...(typeof altitudeFt === "number" && Number.isFinite(altitudeFt)
        ? [`ATC assigned altitude ${altitudeFt} ft is stored on aircraft state, not as published hold data.`]
        : [])
    ]
  };
}

export function adHocHoldingPatternAtPresentPosition({
  activeAtMs,
  aircraft,
  anchorDelayMs = DEFAULT_PRESENT_POSITION_HOLD_EXTRA_DELAY_MS,
  inboundCourseDeg,
  legTimeMin,
  turnDirection
}: {
  activeAtMs: number | undefined;
  anchorDelayMs?: number;
  aircraft: AircraftState;
  inboundCourseDeg?: number;
  legTimeMin?: number;
  turnDirection?: HoldingTurnDirection;
}): HoldingPattern {
  const issuedAtMs = activeAtMs ?? Date.now();
  const deferredUntilMs =
    typeof activeAtMs === "number" || anchorDelayMs > 0
      ? issuedAtMs + anchorDelayMs
      : null;
  const leg = normalizedAtcLegTimeMin(legTimeMin);
  const turn = turnDirection ?? "right";

  return {
    id: `HOLD_ATC_${aircraft.id}_${issuedAtMs}_PPOS`,
    kind: "atc",
    fix_id: PRESENT_POSITION_HOLD_FIX_ID,
    anchor_type: "present_position",
    ...(typeof deferredUntilMs === "number"
      ? { anchor_deferred_until_ms: deferredUntilMs }
      : {
          anchor_latitude: aircraft.latitude,
          anchor_longitude: aircraft.longitude
        }),
    inbound_course_deg: normalizeHeadingDeg(inboundCourseDeg ?? aircraft.heading_true_deg),
    turn_direction: turn,
    leg_time_min: leg,
    source: "ATC ad-hoc hold at present position",
    notes: [
      typeof deferredUntilMs === "number"
        ? "Anchor is fixed at aircraft position when the command becomes active."
        : "Anchor is the aircraft position at the moment the instruction was issued.",
      "Inbound course defaults to aircraft true heading at instruction time."
    ]
  };
}

export function adHocHoldingPatternAtFix({
  activeAtMs,
  aircraft,
  fix,
  fixId,
  inboundCourseDeg,
  legTimeMin,
  turnDirection
}: {
  activeAtMs: number | undefined;
  aircraft: AircraftState;
  fix: { latitude: number; longitude: number };
  fixId: string;
  inboundCourseDeg: number;
  legTimeMin?: number;
  turnDirection?: HoldingTurnDirection;
}): HoldingPattern {
  const issuedAtMs = activeAtMs ?? Date.now();
  const leg = normalizedAtcLegTimeMin(legTimeMin);
  const turn = turnDirection ?? "right";
  const normalizedFixId = normalizeHoldingFixId(fixId);

  return {
    id: `HOLD_ATC_${aircraft.id}_${issuedAtMs}_${normalizedFixId}`,
    kind: "atc",
    fix_id: normalizedFixId,
    anchor_type: "fix",
    anchor_latitude: fix.latitude,
    anchor_longitude: fix.longitude,
    inbound_course_deg: normalizeHeadingDeg(inboundCourseDeg),
    turn_direction: turn,
    leg_time_min: leg,
    source: `ATC ad-hoc hold at ${normalizedFixId}`,
    notes: ["Inbound course is assigned by ATC or inferred from the aircraft-to-fix course."]
  };
}

function normalizedAtcLegTimeMin(legTimeMin: number | undefined) {
  return typeof legTimeMin === "number" && Number.isFinite(legTimeMin) && legTimeMin > 0
    ? legTimeMin
    : DEFAULT_ATC_HOLD_LEG_TIME_MIN;
}

export function aircraftWithHoldingPatternCommand({
  activeAtMs,
  aircraft,
  altitudeFt,
  pattern,
  speedKt,
  startAtAnchor = false
}: {
  activeAtMs: number | undefined;
  aircraft: AircraftState;
  altitudeFt?: number;
  pattern: HoldingPattern;
  speedKt?: number;
  startAtAnchor?: boolean;
}) {
  const commandActiveAtMs = activeAtMs ?? Date.now();
  const targetAltitudeFt =
    altitudeFt ??
    aircraft.execution_altitude_ft ??
    aircraft.assigned?.altitude_ft ??
    Math.round(aircraft.altitude_ft);
  const currentSpeedKt = aircraft.indicated_speed_kt ?? aircraft.ground_speed_kt;
  const assignedOrCurrentSpeedKt = aircraft.assigned?.speed_kt ?? currentSpeedKt;
  const targetSpeedKt = typeof speedKt === "number" && Number.isFinite(speedKt)
    ? speedKt
    : typeof pattern.max_speed_kt === "number" && Number.isFinite(pattern.max_speed_kt)
      ? Math.min(assignedOrCurrentSpeedKt, pattern.max_speed_kt)
      : assignedOrCurrentSpeedKt;
  const startAtAnchorNow = startAtAnchor && typeof pattern.anchor_deferred_until_ms !== "number";

  return {
    ...aircraft,
    route_mode: "hold" as const,
    next_fix: pattern.fix_id,
    holding_pattern: pattern,
    holding_state: startAtAnchorNow
      ? holdingStateAtFix({
          aircraftHeadingTrueDeg: aircraft.heading_true_deg,
          currentTimeMs: commandActiveAtMs,
          pattern
        })
      : entryToFixHoldingState(pattern, commandActiveAtMs),
    heading_active_at_ms: commandActiveAtMs,
    one_circle_turn_state: undefined,
    altitude_active_at_ms: commandActiveAtMs,
    speed_active_at_ms: commandActiveAtMs,
    altitude_control_mode: "controller" as const,
    speed_control_mode: "controller" as const,
    execution_altitude_ft: targetAltitudeFt,
    execution_speed_kt: targetSpeedKt,
    controller_assigned_speed_kt: targetSpeedKt,
    controller_speed_policy: {
      type: "target" as const,
      speed_kt: targetSpeedKt,
      active_at_ms: commandActiveAtMs
    },
    assigned: {
      ...aircraft.assigned,
      altitude_ft: targetAltitudeFt,
      speed_kt: targetSpeedKt
    },
    scratchpad: aircraft.scratchpad?.includes("HLD")
      ? aircraft.scratchpad
      : [aircraft.scratchpad, "HLD"].filter(Boolean).join(" ").trim(),
    scratchpad_auto_procedure_token: "HLD"
  };
}
