export type AtcCommandIntent =
  | "ASSIGN_HEADING"
  | "MAINTAIN_PRESENT_HEADING"
  | "ONE_CIRCLE_HEADING"
  | "ASSIGN_SPEED"
  | "SPEED_UNTIL_FIX"
  | "SPEED_UNTIL_FIX_THEN_NORMAL"
  | "MAXIMUM_FORWARD_SPEED"
  | "MINIMUM_SPEED"
  | "MAINTAIN_SPEED_LIMIT"
  | "MAINTAIN_SPEED_UNTIL"
  | "RESUME_NORMAL_SPEED"
  | "ASSIGN_ALTITUDE"
  | "CROSS_FIX_RESTRICTION"
  | "ASSIGN_VERTICAL_SPEED"
  | "INCREASE_DESCENT_RATE"
  | "INCREASE_CLIMB_RATE"
  | "RESUME_NORMAL_CLIMB"
  | "RESUME_NORMAL_DESCENT"
  | "DIRECT_TO_FIX"
  | "TURN_DIRECT_FIX"
  | "CLEARED_ILS"
  | "CLEARED_VISUAL_APPROACH"
  | "DESCEND_VIA"
  | "CANCEL_LEVEL_RESTRICTION"
  | "CANCEL_SPEED_RESTRICTION"
  | "AFFIRM"
  | "NEGATIVE"
  | "EXPEDITE_DESCENT"
  | "EXPEDITE_CLIMB"
  | "GO_AROUND"
  | "FLY_MISSED_APPROACH"
  | "TRAFFIC_INFORMATION"
  | "ASK_INTENTIONS"
  | "SEQUENCE_NUMBER"
  | "CONFIRM_CALLSIGN"
  | "FIRST_CONTACT_ACK"
  | "RADIO_STANDBY"
  | "CONTACT_FREQUENCY"
  | "HOLD_AT_FIX";

export interface ParsedAtcCommand {
  ok: boolean;
  callsign: string | null;
  body: string;
  preamble?: AtcCommandPreambleInfo;
  intent: AtcCommandIntent | null;
  category: string | null;
  pattern_id: string | null;
  matched_pattern: string | null;
  slots: Record<string, unknown>;
  error?: "NO_PATTERN_MATCH";
}

export interface AtcCommandPreambleInfo {
  present: boolean;
  unit?: "APP" | "DEP";
  radar_contact?: boolean;
  stripped_tokens: string[];
}

export function confirmCallsignCommandRequestsRepeat(
  parsed: Pick<ParsedAtcCommand, "body" | "callsign" | "intent">
) {
  return (
    parsed.intent === "CONFIRM_CALLSIGN" &&
    !parsed.callsign &&
    (
      (/\bSAY\s+AGAIN\b/.test(parsed.body) && !/\bCALLSIGN\b/.test(parsed.body)) ||
      /\bWHO\s+(?:WAS\s+)?CALL(?:ED|ING)\b/.test(parsed.body)
    )
  );
}

interface GrammarEntry {
  id: string;
  intent: AtcCommandIntent;
  category: string;
  patterns: string[];
}

const MINIMUM_SPEED_TARGET_KT = 155;
const legTimeWordValues: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3
};

const placeholderRegex = new Map<string, string>([
  ["heading_deg", "(?<heading_deg>\\d{1,3})"],
  ["inbound_heading_deg", "(?<inbound_heading_deg>\\d{1,3})"],
  ["speed_kt", "(?<speed_kt>\\d{2,3})"],
  ["altitude_ft", "(?<altitude_ft>\\d{2,5})"],
  ["altitude_ft_alt", "(?<altitude_ft_alt>\\d{2,5})"],
  ["vertical_rate_fpm", "(?<vertical_rate_fpm>-?\\d{3,4})"],
  ["fix_id", "(?<fix_id>[A-Z0-9]{2,6})"],
  ["hold_fix_id", "(?<hold_fix_id>[A-Z0-9]{2,6})"],
  ["facility", "(?<facility>JEJU TOWER|JEJU APPROACH|TOWER|APPROACH|DEPARTURE|RADAR|GROUND)"],
  ["frequency_mhz", "(?<frequency_mhz>\\d{3}(?:\\s+\\d{1,3})?)"],
  ["turn_direction", "(?<turn_direction>LEFT|RIGHT)"],
  ["leg_time_minutes", "(?<leg_time_minutes>\\d+(?:\\.\\d+)?|ONE|TWO|THREE)"],
  ["runway", "(?<runway>\\d{2}[LRC]?)"],
  ["approach_variant", "(?<approach_variant>Z|Y)"],
  ["sequence_number", "(?<sequence_number>\\d{1,2})"],
  ["clock_position", "(?<clock_position>\\d{1,2})"],
  ["distance_nm", "(?<distance_nm>\\d{1,2})"],
  ["direction_bound", "(?<direction_bound>NORTH|SOUTH|EAST|WEST|NORTHEAST|NORTHWEST|SOUTHEAST|SOUTHWEST)"],
  ["traffic_altitude_ft", "(?<traffic_altitude_ft>\\d{2,5})"],
  ["target_altitude_ft", "(?<target_altitude_ft>\\d{2,5})"],
  ["aircraft_type", "(?<aircraft_type>[A-Z][A-Z0-9]{1,5})"],
  ["procedure_compact", "(?<procedure_compact>\\d+[A-Z])"],
  ["procedure_number_word", "(?<procedure_number_word>ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE)"],
  ["procedure_suffix_word", "(?<procedure_suffix_word>PAPA|MIKE|ECHO|WHISKEY|NOVEMBER|KILO|LIMA|YANKEE|ZULU)"],
  ["procedure_id", "(?<procedure_id>[A-Z0-9_\\-]+)"],
  ["reason", "(?<reason>.+)"]
]);

const grammar: GrammarEntry[] = [
  {
    id: "heading_basic",
    intent: "ASSIGN_HEADING",
    category: "HEADING",
    patterns: ["HEADING {heading_deg}", "FLY HEADING {heading_deg}"]
  },
  {
    id: "heading_present",
    intent: "MAINTAIN_PRESENT_HEADING",
    category: "HEADING",
    patterns: [
      "PRESENT HEADING",
      "FLY PRESENT HEADING",
      "MAINTAIN PRESENT HEADING",
      "MAINTAIN HEADING",
      "CONTINUE PRESENT HEADING",
      "CONTINUE HEADING"
    ]
  },
  {
    id: "heading_one_circle",
    intent: "ONE_CIRCLE_HEADING",
    category: "HEADING",
    patterns: [
      "TURN {turn_direction} ONE CIRCLE HEADING {heading_deg}",
      "TURN {turn_direction} 1 CIRCLE HEADING {heading_deg}",
      "MAKE {turn_direction} ONE CIRCLE HEADING {heading_deg}",
      "MAKE {turn_direction} 1 CIRCLE HEADING {heading_deg}"
    ]
  },
  {
    id: "heading_turn_direction",
    intent: "ASSIGN_HEADING",
    category: "HEADING",
    patterns: [
      "TURN {turn_direction} HEADING {heading_deg}",
      "TURN {turn_direction} {heading_deg}",
      "{turn_direction} TURN HEADING {heading_deg}",
      "{turn_direction} HEADING {heading_deg}"
    ]
  },
  {
    id: "speed_until_fix_then_normal",
    intent: "SPEED_UNTIL_FIX_THEN_NORMAL",
    category: "SPEED",
    patterns: [
      "SPEED {speed_kt} UNTIL {fix_id} THEN NORMAL SPEED",
      "MAINTAIN SPEED {speed_kt} UNTIL {fix_id} THEN NORMAL SPEED",
      "REDUCE SPEED {speed_kt} UNTIL {fix_id} THEN NORMAL SPEED",
      "REDUCE SPEED TO {speed_kt} UNTIL {fix_id} THEN NORMAL SPEED",
      "INCREASE SPEED {speed_kt} UNTIL {fix_id} THEN NORMAL SPEED",
      "INCREASE SPEED TO {speed_kt} UNTIL {fix_id} THEN NORMAL SPEED"
    ]
  },
  {
    id: "speed_until_fix",
    intent: "SPEED_UNTIL_FIX",
    category: "SPEED",
    patterns: [
      "SPEED {speed_kt} UNTIL {fix_id}",
      "MAINTAIN SPEED {speed_kt} UNTIL {fix_id}",
      "REDUCE SPEED {speed_kt} UNTIL {fix_id}",
      "REDUCE SPEED TO {speed_kt} UNTIL {fix_id}",
      "INCREASE SPEED {speed_kt} UNTIL {fix_id}",
      "INCREASE SPEED TO {speed_kt} UNTIL {fix_id}"
    ]
  },
  {
    id: "speed_maximum_forward",
    intent: "MAXIMUM_FORWARD_SPEED",
    category: "SPEED",
    patterns: ["MAXIMUM FORWARD SPEED", "MAINTAIN MAXIMUM FORWARD SPEED"]
  },
  {
    id: "speed_assign",
    intent: "ASSIGN_SPEED",
    category: "SPEED",
    patterns: [
      "SPEED {speed_kt}",
      "SPEED {speed_kt} KNOTS",
      "MAINTAIN {speed_kt} KNOTS",
      "MAINTAIN SPEED {speed_kt}",
      "MAINTAIN SPEED {speed_kt} KNOTS",
      "INCREASE {speed_kt}",
      "INCREASE {speed_kt} KNOTS",
      "INCREASE SPEED {speed_kt}",
      "INCREASE SPEED TO {speed_kt}",
      "INCREASE SPEED TO {speed_kt} KNOTS",
      "INCREASE TO {speed_kt}",
      "INCREASE TO {speed_kt} KNOTS",
      "INCREASE TO SPEED {speed_kt}",
      "INCREASE TO SPEED {speed_kt} KNOTS",
      "REDUCE {speed_kt}",
      "REDUCE {speed_kt} KNOTS",
      "REDUCE SPEED {speed_kt}",
      "REDUCE SPEED TO {speed_kt}",
      "REDUCE SPEED TO {speed_kt} KNOTS",
      "REDUCE TO {speed_kt}",
      "REDUCE TO {speed_kt} KNOTS",
      "REDUCE TO SPEED {speed_kt}",
      "REDUCE TO SPEED {speed_kt} KNOTS"
    ]
  },
  {
    id: "speed_limit",
    intent: "MAINTAIN_SPEED_LIMIT",
    category: "SPEED",
    patterns: [
      "SPEED {speed_kt} OR LESS",
      "SPEED {speed_kt} KNOTS OR LESS",
      "MAINTAIN {speed_kt} OR LESS",
      "MAINTAIN {speed_kt} KNOTS OR LESS",
      "MAINTAIN SPEED {speed_kt} OR LESS",
      "MAINTAIN SPEED {speed_kt} KNOTS OR LESS",
      "SPEED {speed_kt} OR GREATER",
      "SPEED {speed_kt} KNOTS OR GREATER",
      "MAINTAIN {speed_kt} OR GREATER",
      "MAINTAIN {speed_kt} KNOTS OR GREATER",
      "MAINTAIN SPEED {speed_kt} OR GREATER",
      "MAINTAIN SPEED {speed_kt} KNOTS OR GREATER"
    ]
  },
  {
    id: "speed_minimum_practical",
    intent: "MINIMUM_SPEED",
    category: "SPEED",
    patterns: [
      "MINIMUM SPEED",
      "MAINTAIN MINIMUM SPEED",
      "REDUCE TO MINIMUM SPEED",
      "REDUCE SPEED TO MINIMUM",
      "REDUCE SPEED TO MINIMUM SPEED"
    ]
  },
  {
    id: "speed_minimum_until",
    intent: "MAINTAIN_SPEED_UNTIL",
    category: "SPEED",
    patterns: [
      "MAINTAIN {speed_kt} KNOTS OR GREATER UNTIL PASSING {altitude_ft}",
      "MAINTAIN SPEED {speed_kt} OR GREATER UNTIL PASSING {altitude_ft}",
      "MAINTAIN {speed_kt} KNOTS OR GREATER UNTIL {fix_id}",
      "MAINTAIN SPEED {speed_kt} OR GREATER UNTIL {fix_id}"
    ]
  },
  {
    id: "speed_resume_normal",
    intent: "RESUME_NORMAL_SPEED",
    category: "SPEED",
    patterns: ["RESUME NORMAL SPEED"]
  },
  {
    id: "altitude_climb_descend",
    intent: "ASSIGN_ALTITUDE",
    category: "ALTITUDE",
    patterns: [
      "CLIMB {altitude_ft}",
      "CLIMB TO {altitude_ft}",
      "CLIMB AND MAINTAIN {altitude_ft}",
      "DESCEND {altitude_ft}",
      "DESCEND TO {altitude_ft}",
      "DESCEND {altitude_ft} OR {altitude_ft_alt}",
      "DESCEND TO {altitude_ft} OR {altitude_ft_alt}",
      "DESCEND AND MAINTAIN {altitude_ft}",
      "MAINTAIN {altitude_ft}"
    ]
  },
  {
    id: "cross_fix_restriction",
    intent: "CROSS_FIX_RESTRICTION",
    category: "ALTITUDE",
    patterns: [
      "CROSS {fix_id} AT OR BELOW {altitude_ft}",
      "CROSS {fix_id} BELOW {altitude_ft}"
    ]
  },
  {
    id: "vertical_speed",
    intent: "ASSIGN_VERTICAL_SPEED",
    category: "VERTICAL",
    patterns: ["CLIMB RATE {vertical_rate_fpm}", "DESCEND RATE {vertical_rate_fpm}", "VERTICAL SPEED {vertical_rate_fpm}"]
  },
  {
    id: "vertical_increase_descent_rate",
    intent: "INCREASE_DESCENT_RATE",
    category: "VERTICAL",
    patterns: ["INCREASE RATE OF DESCENT", "INCREASE DESCENT RATE"]
  },
  {
    id: "vertical_increase_climb_rate",
    intent: "INCREASE_CLIMB_RATE",
    category: "VERTICAL",
    patterns: ["INCREASE RATE OF CLIMB", "INCREASE CLIMB RATE"]
  },
  {
    id: "vertical_resume_climb",
    intent: "RESUME_NORMAL_CLIMB",
    category: "VERTICAL",
    patterns: ["RESUME NORMAL CLIMB", "NORMAL CLIMB"]
  },
  {
    id: "vertical_resume_descent",
    intent: "RESUME_NORMAL_DESCENT",
    category: "VERTICAL",
    patterns: ["RESUME NORMAL DESCENT", "NORMAL DESCENT"]
  },
  {
    id: "direct_to_fix",
    intent: "DIRECT_TO_FIX",
    category: "DIRECT",
    patterns: [
      "DIRECT {fix_id}",
      "DIRECT TO {fix_id}",
      "PROCEED DIRECT {fix_id}",
      "PROCEED DIRECT TO {fix_id}",
      "CLEARED DIRECT {fix_id}",
      "CLEARED DIRECT TO {fix_id}",
      "FLY DIRECT {fix_id}",
      "FLY DIRECT TO {fix_id}",
      "DIRECT {fix_id} DESCEND {altitude_ft}",
      "DIRECT {fix_id} DESCEND TO {altitude_ft}",
      "DIRECT TO {fix_id} DESCEND {altitude_ft}",
      "DIRECT TO {fix_id} DESCEND TO {altitude_ft}",
      "PROCEED DIRECT {fix_id} DESCEND {altitude_ft}",
      "PROCEED DIRECT {fix_id} DESCEND TO {altitude_ft}",
      "PROCEED DIRECT TO {fix_id} DESCEND {altitude_ft}",
      "PROCEED DIRECT TO {fix_id} DESCEND TO {altitude_ft}",
      "DIRECT {fix_id} DESCEND {altitude_ft} CANCEL LEVEL",
      "DIRECT {fix_id} DESCEND {altitude_ft} CANCEL LEVEL RESTRICTION",
      "DIRECT {fix_id} DESCEND TO {altitude_ft} CANCEL LEVEL",
      "DIRECT {fix_id} DESCEND TO {altitude_ft} CANCEL LEVEL RESTRICTION",
      "DIRECT TO {fix_id} DESCEND {altitude_ft} CANCEL LEVEL",
      "DIRECT TO {fix_id} DESCEND {altitude_ft} CANCEL LEVEL RESTRICTION",
      "DIRECT TO {fix_id} DESCEND TO {altitude_ft} CANCEL LEVEL",
      "DIRECT TO {fix_id} DESCEND TO {altitude_ft} CANCEL LEVEL RESTRICTION",
      "PROCEED DIRECT {fix_id} DESCEND {altitude_ft} CANCEL LEVEL",
      "PROCEED DIRECT {fix_id} DESCEND {altitude_ft} CANCEL LEVEL RESTRICTION",
      "PROCEED DIRECT {fix_id} DESCEND TO {altitude_ft} CANCEL LEVEL",
      "PROCEED DIRECT {fix_id} DESCEND TO {altitude_ft} CANCEL LEVEL RESTRICTION",
      "PROCEED DIRECT TO {fix_id} DESCEND {altitude_ft} CANCEL LEVEL",
      "PROCEED DIRECT TO {fix_id} DESCEND {altitude_ft} CANCEL LEVEL RESTRICTION",
      "PROCEED DIRECT TO {fix_id} DESCEND TO {altitude_ft} CANCEL LEVEL",
      "PROCEED DIRECT TO {fix_id} DESCEND TO {altitude_ft} CANCEL LEVEL RESTRICTION"
    ]
  },
  {
    id: "direct_to_fix_turn_direction",
    intent: "TURN_DIRECT_FIX",
    category: "DIRECT",
    patterns: [
      "TURN {turn_direction} DIRECT {fix_id}",
      "TURN {turn_direction} DIRECT TO {fix_id}",
      "{turn_direction} TURN DIRECT {fix_id}",
      "{turn_direction} TURN DIRECT TO {fix_id}"
    ]
  },
  {
    id: "cleared_ils",
    intent: "CLEARED_ILS",
    category: "PROCEDURE",
    patterns: [
      "CLEARED ILS RUNWAY {runway}",
      "CLEARED ILS RWY {runway}",
      "CLEARED ILS RUNWAY {runway} APPROACH",
      "CLEARED ILS RWY {runway} APPROACH",
      "CLEARED ILS APPROACH RUNWAY {runway}",
      "CLEARED ILS APPROACH RWY {runway}",
      "CLEARED ILS {approach_variant} RUNWAY {runway} APPROACH",
      "CLEARED ILS {approach_variant} RUNWAY {runway}",
      "CLEARED ILS {approach_variant} RWY {runway}",
      "CLEARED ILS {approach_variant} RWY {runway} APPROACH",
      "CLEARED ILS {approach_variant} APPROACH RUNWAY {runway}",
      "CLEARED ILS {approach_variant} APPROACH RWY {runway}",
      "CLEARED FOR ILS RUNWAY {runway}",
      "CLEARED FOR ILS RWY {runway}",
      "CLEARED FOR ILS {approach_variant} RUNWAY {runway}",
      "CLEARED FOR ILS {approach_variant} RWY {runway}",
      "CLEARED FOR ILS {approach_variant} RUNWAY {runway} APPROACH",
      "CLEARED FOR ILS {approach_variant} RWY {runway} APPROACH",
      "CLEARED FOR ILS {approach_variant} APPROACH RUNWAY {runway}",
      "CLEARED FOR ILS {approach_variant} APPROACH RWY {runway}"
    ]
  },
  {
    id: "cleared_visual_approach",
    intent: "CLEARED_VISUAL_APPROACH",
    category: "PROCEDURE",
    patterns: [
      "CLEARED VISUAL APPROACH RUNWAY {runway}",
      "CLEARED VISUAL APPROACH RWY {runway}",
      "CLEARED VISUAL RUNWAY {runway}",
      "CLEARED VISUAL RWY {runway}",
      "CLEARED FOR VISUAL APPROACH RUNWAY {runway}",
      "CLEARED FOR VISUAL APPROACH RWY {runway}",
      "CLEARED FOR VISUAL RUNWAY {runway}",
      "CLEARED FOR VISUAL RWY {runway}"
    ]
  },
  {
    id: "descend_via",
    intent: "DESCEND_VIA",
    category: "PROCEDURE",
    patterns: [
      "DESCEND VIA",
      "DESCEND VIA {procedure_id}",
      "DESCEND VIA {fix_id} {procedure_number_word} {procedure_suffix_word} ARRIVAL",
      "DESCEND VIA {fix_id} {procedure_number_word} {procedure_suffix_word} ARRIVAL TO {altitude_ft}",
      "DESCEND VIA {fix_id} {procedure_number_word} {procedure_suffix_word} ARRIVAL TO {altitude_ft} CANCEL LEVEL RESTRICTION",
      "DESCEND VIA {fix_id} {procedure_compact} ARRIVAL",
      "DESCEND VIA {fix_id} {procedure_compact} ARRIVAL TO {altitude_ft}",
      "DESCEND VIA {fix_id} {procedure_compact} ARRIVAL TO {altitude_ft} CANCEL LEVEL",
      "DESCEND VIA {fix_id} {procedure_compact} ARRIVAL TO {altitude_ft} CANCEL LEVEL RESTRICTION",
      "DESCEND VIA {fix_id} {procedure_compact} TO {altitude_ft}",
      "DESCEND VIA {fix_id} {procedure_compact} TO {altitude_ft} CANCEL LEVEL",
      "DESCEND VIA {fix_id} {procedure_compact} TO {altitude_ft} CANCEL LEVEL RESTRICTION"
    ]
  },
  {
    id: "cancel_level_restriction",
    intent: "CANCEL_LEVEL_RESTRICTION",
    category: "PROCEDURE",
    patterns: [
      "CANCEL LEVEL RESTRICTION",
      "CANCEL LEVEL RESTRICTIONS",
      "CANCEL ALTITUDE RESTRICTION",
      "CANCEL ALTITUDE RESTRICTIONS",
      "CANCEL LEVEL RESTRICTION AT {fix_id}",
      "CANCEL LEVEL RESTRICTIONS AT {fix_id}",
      "CANCEL ALTITUDE RESTRICTION AT {fix_id}",
      "CANCEL ALTITUDE RESTRICTIONS AT {fix_id}",
      "CANCEL {fix_id} LEVEL RESTRICTION",
      "CANCEL {fix_id} LEVEL RESTRICTIONS",
      "CANCEL {fix_id} ALTITUDE RESTRICTION",
      "CANCEL {fix_id} ALTITUDE RESTRICTIONS"
    ]
  },
  {
    id: "cancel_speed_restriction",
    intent: "CANCEL_SPEED_RESTRICTION",
    category: "PROCEDURE",
    patterns: [
      "CANCEL SPEED RESTRICTION",
      "CANCEL SPEED RESTRICTIONS",
      "CANCEL SPEED RESTRICTION AT {fix_id}",
      "CANCEL SPEED RESTRICTIONS AT {fix_id}",
      "CANCEL {fix_id} SPEED RESTRICTION",
      "CANCEL {fix_id} SPEED RESTRICTIONS"
    ]
  },
  {
    id: "affirm",
    intent: "AFFIRM",
    category: "READBACK",
    patterns: ["AFFIRM", "AFFIRMATIVE", "YES", "어펌", "어펌입니다"]
  },
  {
    id: "negative",
    intent: "NEGATIVE",
    category: "READBACK",
    patterns: ["NEGATIVE", "NO", "취소", "아니오"]
  },
  {
    id: "expedite_descent",
    intent: "EXPEDITE_DESCENT",
    category: "VERTICAL",
    patterns: ["EXPEDITE DESCENT", "EXPEDITE DESCEND", "EXPEDITE YOUR DESCENT"]
  },
  {
    id: "expedite_climb",
    intent: "EXPEDITE_CLIMB",
    category: "VERTICAL",
    patterns: ["EXPEDITE CLIMB", "EXPEDITE YOUR CLIMB"]
  },
  {
    id: "go_around",
    intent: "GO_AROUND",
    category: "MISSED",
    patterns: ["GO AROUND"]
  },
  {
    id: "fly_missed_approach",
    intent: "FLY_MISSED_APPROACH",
    category: "MISSED",
    patterns: ["FLY MISSED APPROACH", "EXECUTE MISSED APPROACH"]
  },
  {
    id: "traffic_information",
    intent: "TRAFFIC_INFORMATION",
    category: "TRAFFIC",
    patterns: [
      "TRAFFIC {clock_position} OCLOCK {distance_nm} MILE {direction_bound} BOUND PASSING {traffic_altitude_ft}",
      "TRAFFIC {clock_position} OCLOCK {distance_nm} MILE {direction_bound} BOUND PASSING {traffic_altitude_ft} FOR {target_altitude_ft}",
      "TRAFFIC {clock_position} OCLOCK {distance_nm} MILE {direction_bound} BOUND PASSING {traffic_altitude_ft} TO {target_altitude_ft}",
      "TRAFFIC {clock_position} OCLOCK {distance_nm} MILE {direction_bound} BOUND PASSING {traffic_altitude_ft} FOR {target_altitude_ft} {aircraft_type}",
      "TRAFFIC {clock_position} OCLOCK {distance_nm} MILE {direction_bound} BOUND PASSING {traffic_altitude_ft} TO {target_altitude_ft} {aircraft_type}",
      "TRAFFIC {aircraft_type} {direction_bound} BOUND {distance_nm} MILE {clock_position} OCLOCK PASSING {traffic_altitude_ft}",
      "TRAFFIC {aircraft_type} {direction_bound} BOUND {distance_nm} MILE {clock_position} OCLOCK PASSING {traffic_altitude_ft} TO {target_altitude_ft}"
    ]
  },
  {
    id: "ask_intentions",
    intent: "ASK_INTENTIONS",
    category: "MISSED",
    patterns: ["SAY INTENTIONS", "CONFIRM ONE MORE APPROACH", "CONFIRM 1 MORE APPROACH"]
  },
  {
    id: "sequence_number",
    intent: "SEQUENCE_NUMBER",
    category: "SEQUENCE",
    patterns: ["YOU ARE NUMBER {sequence_number}", "SEQUENCE NUMBER {sequence_number}"]
  },
  {
    id: "confirm_callsign",
    intent: "CONFIRM_CALLSIGN",
    category: "RADIO",
    patterns: [
      "SAY AGAIN",
      "SAY AGAIN PLEASE",
      "CONFIRM CALLSIGN",
      "SAY AGAIN CALLSIGN",
      "CALLSIGN SAY AGAIN",
      "CALLING STATION SAY AGAIN",
      "STATION CALLING SAY AGAIN",
      "LAST CALLING STATION SAY AGAIN",
      "CALLING TRAFFIC SAY AGAIN",
      "CALLING JEJU APPROACH SAY AGAIN",
      "WHO CALLED",
      "WHO WAS CALLING"
    ]
  },
  {
    id: "first_contact_go_ahead",
    intent: "FIRST_CONTACT_ACK",
    category: "RADIO",
    patterns: ["GO AHEAD"]
  },
  {
    id: "radio_standby",
    intent: "RADIO_STANDBY",
    category: "RADIO",
    patterns: ["STANDBY", "STAND BY"]
  },
  {
    id: "contact_frequency",
    intent: "CONTACT_FREQUENCY",
    category: "RADIO",
    patterns: [
      "CONTACT {facility}",
      "CONTACT {facility} {frequency_mhz}",
      "CONTACT {facility} ON {frequency_mhz}",
      "MONITOR {facility}",
      "MONITOR {facility} {frequency_mhz}",
      "MONITOR {facility} ON {frequency_mhz}"
    ]
  },
  {
    id: "hold_at_fix",
    intent: "HOLD_AT_FIX",
    category: "HOLD",
    patterns: [
      "HOLD AS PUBLISHED",
      "HOLD AS PUBLISHED MAINTAIN {altitude_ft}",
      "HOLD AS PUBLISHED SPEED {speed_kt}",
      "HOLD AS PUBLISHED MAINTAIN {altitude_ft} SPEED {speed_kt}",
      "HOLD AS PUBLISHED SPEED {speed_kt} MAINTAIN {altitude_ft}",
      "HOLD AT {fix_id} AS PUBLISHED",
      "HOLD AT {fix_id} AS PUBLISHED MAINTAIN {altitude_ft}",
      "HOLD AT {fix_id} AS PUBLISHED SPEED {speed_kt}",
      "HOLD AT {fix_id} AS PUBLISHED MAINTAIN {altitude_ft} SPEED {speed_kt}",
      "HOLD AT {fix_id} AS PUBLISHED SPEED {speed_kt} MAINTAIN {altitude_ft}",
      "HOLD OVER {fix_id} AS PUBLISHED",
      "HOLD OVER {fix_id} AS PUBLISHED MAINTAIN {altitude_ft}",
      "HOLD OVER {fix_id} AS PUBLISHED SPEED {speed_kt}",
      "HOLD OVER {fix_id} AS PUBLISHED MAINTAIN {altitude_ft} SPEED {speed_kt}",
      "HOLD OVER {fix_id} AS PUBLISHED SPEED {speed_kt} MAINTAIN {altitude_ft}",
      "DIRECT {fix_id} HOLD AS PUBLISHED",
      "DIRECT TO {fix_id} HOLD AS PUBLISHED",
      "PROCEED DIRECT {fix_id} HOLD AS PUBLISHED",
      "PROCEED DIRECT TO {fix_id} HOLD AS PUBLISHED",
      "DIRECT {fix_id} MAINTAIN {altitude_ft} HOLD AS PUBLISHED",
      "DIRECT TO {fix_id} MAINTAIN {altitude_ft} HOLD AS PUBLISHED",
      "DIRECT {fix_id} DESCEND {altitude_ft} HOLD AS PUBLISHED",
      "DIRECT {fix_id} DESCEND TO {altitude_ft} HOLD AS PUBLISHED",
      "DIRECT TO {fix_id} DESCEND {altitude_ft} HOLD AS PUBLISHED",
      "DIRECT TO {fix_id} DESCEND TO {altitude_ft} HOLD AS PUBLISHED",
      "DIRECT {fix_id} SPEED {speed_kt} HOLD AS PUBLISHED",
      "DIRECT TO {fix_id} SPEED {speed_kt} HOLD AS PUBLISHED",
      "DIRECT {fix_id} MAINTAIN {altitude_ft} SPEED {speed_kt} HOLD AS PUBLISHED",
      "DIRECT TO {fix_id} MAINTAIN {altitude_ft} SPEED {speed_kt} HOLD AS PUBLISHED",
      "DIRECT {fix_id} SPEED {speed_kt} MAINTAIN {altitude_ft} HOLD AS PUBLISHED",
      "DIRECT TO {fix_id} SPEED {speed_kt} MAINTAIN {altitude_ft} HOLD AS PUBLISHED",
      "DIRECT {fix_id} DESCEND {altitude_ft} SPEED {speed_kt} HOLD AS PUBLISHED",
      "DIRECT {fix_id} DESCEND TO {altitude_ft} SPEED {speed_kt} HOLD AS PUBLISHED",
      "DIRECT TO {fix_id} DESCEND {altitude_ft} SPEED {speed_kt} HOLD AS PUBLISHED",
      "DIRECT TO {fix_id} DESCEND TO {altitude_ft} SPEED {speed_kt} HOLD AS PUBLISHED",
      "HOLD AT PRESENT POSITION",
      "HOLD PRESENT POSITION",
      "HOLD AT PRESENT POSITION {turn_direction} TURNS",
      "HOLD PRESENT POSITION {turn_direction} TURNS",
      "HOLD AT PRESENT POSITION {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS",
      "HOLD PRESENT POSITION {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS",
      "HOLD AT PRESENT POSITION {leg_time_minutes} MINUTE LEGS {turn_direction} TURNS",
      "HOLD PRESENT POSITION {leg_time_minutes} MINUTE LEGS {turn_direction} TURNS",
      "HOLD AT PRESENT POSITION {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS MAINTAIN {altitude_ft}",
      "HOLD PRESENT POSITION {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS MAINTAIN {altitude_ft}",
      "HOLD AT PRESENT POSITION {turn_direction} TURNS MAINTAIN {altitude_ft} {leg_time_minutes} MINUTE LEGS",
      "HOLD PRESENT POSITION {turn_direction} TURNS MAINTAIN {altitude_ft} {leg_time_minutes} MINUTE LEGS",
      "HOLD AT PRESENT POSITION {leg_time_minutes} MINUTE LEGS {turn_direction} TURNS MAINTAIN {altitude_ft}",
      "HOLD PRESENT POSITION {leg_time_minutes} MINUTE LEGS {turn_direction} TURNS MAINTAIN {altitude_ft}",
      "HOLD AT PRESENT POSITION {leg_time_minutes} MINUTE LEGS MAINTAIN {altitude_ft} {turn_direction} TURNS",
      "HOLD PRESENT POSITION {leg_time_minutes} MINUTE LEGS MAINTAIN {altitude_ft} {turn_direction} TURNS",
      "HOLD AT PRESENT POSITION MAINTAIN {altitude_ft} {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS",
      "HOLD PRESENT POSITION MAINTAIN {altitude_ft} {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS",
      "HOLD AT PRESENT POSITION MAINTAIN {altitude_ft} {leg_time_minutes} MINUTE LEGS {turn_direction} TURNS",
      "HOLD PRESENT POSITION MAINTAIN {altitude_ft} {leg_time_minutes} MINUTE LEGS {turn_direction} TURNS",
      "HOLD AT PRESENT POSITION MAINTAIN {altitude_ft}",
      "HOLD PRESENT POSITION MAINTAIN {altitude_ft}",
      "HOLD AT PRESENT POSITION SPEED {speed_kt}",
      "HOLD PRESENT POSITION SPEED {speed_kt}",
      "HOLD {fix_id}",
      "HOLD {fix_id} MAINTAIN {altitude_ft}",
      "HOLD AT {fix_id}",
      "HOLD AT {fix_id} MAINTAIN {altitude_ft}",
      "HOLD AT {fix_id} INBOUND HEADING {inbound_heading_deg}",
      "HOLD AT {fix_id} INBOUND HEADING {inbound_heading_deg} MAINTAIN {altitude_ft}",
      "HOLD AT {fix_id} INBOUND HEADING {inbound_heading_deg} {turn_direction} TURNS",
      "HOLD AT {fix_id} INBOUND HEADING {inbound_heading_deg} {turn_direction} TURNS MAINTAIN {altitude_ft}",
      "HOLD AT {fix_id} INBOUND HEADING {inbound_heading_deg} {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS",
      "HOLD AT {fix_id} INBOUND HEADING {inbound_heading_deg} {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS MAINTAIN {altitude_ft}",
      "HOLD AT {fix_id} {turn_direction} TURNS",
      "HOLD AT {fix_id} {turn_direction} TURNS MAINTAIN {altitude_ft}",
      "HOLD AT {fix_id} {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS",
      "HOLD AT {fix_id} {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS MAINTAIN {altitude_ft}",
      "HOLD OVER {fix_id}",
      "HOLD OVER {fix_id} MAINTAIN {altitude_ft}",
      "HOLD OVER {fix_id} INBOUND HEADING {inbound_heading_deg}",
      "HOLD OVER {fix_id} INBOUND HEADING {inbound_heading_deg} MAINTAIN {altitude_ft}",
      "HOLD OVER {fix_id} INBOUND HEADING {inbound_heading_deg} {turn_direction} TURNS",
      "HOLD OVER {fix_id} INBOUND HEADING {inbound_heading_deg} {turn_direction} TURNS MAINTAIN {altitude_ft}",
      "HOLD OVER {fix_id} INBOUND HEADING {inbound_heading_deg} {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS",
      "HOLD OVER {fix_id} INBOUND HEADING {inbound_heading_deg} {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS MAINTAIN {altitude_ft}",
      "HOLD OVER {fix_id} {turn_direction} TURNS",
      "HOLD OVER {fix_id} {turn_direction} TURNS MAINTAIN {altitude_ft}",
      "HOLD OVER {fix_id} {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS",
      "HOLD OVER {fix_id} {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS MAINTAIN {altitude_ft}",
      "DIRECT {fix_id} HOLD INBOUND HEADING {inbound_heading_deg}",
      "DIRECT TO {fix_id} HOLD INBOUND HEADING {inbound_heading_deg}",
      "DIRECT {fix_id} HOLD INBOUND HEADING {inbound_heading_deg} {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS",
      "DIRECT TO {fix_id} HOLD INBOUND HEADING {inbound_heading_deg} {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS",
      "DIRECT {fix_id} HOLD {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS",
      "DIRECT TO {fix_id} HOLD {turn_direction} TURNS {leg_time_minutes} MINUTE LEGS",
      "DIRECT {fix_id} HOLD AT {hold_fix_id} INBOUND HEADING {inbound_heading_deg}",
      "DIRECT TO {fix_id} HOLD AT {hold_fix_id} INBOUND HEADING {inbound_heading_deg}"
    ]
  }
];

export function normalizeAtcPhrase(rawPhrase: string) {
  const phrase = rawPhrase
    .trim()
    .toUpperCase()
    .replace(/[,.]/g, " ")
    .replace(/\s+/g, " ");

  return normalizeAtcNumberFragments(phrase);
}

export function normalizeAtcNumberFragments(rawPhrase: string) {
  let phrase = rawPhrase;

  phrase = phrase
    .replace(/\b(ONE|TWO|THREE|\d+(?:\.\d+)?)\s*-\s*(MINUTES?|LEGS?)\b/g, "$1 $2")
    .replace(/\bHDG\b/g, "HEADING")
    .replace(/\bHEDGING\b/g, "HEADING")
    .replace(/\bSPIT\b/g, "SPEED")
    .replace(/\bMINIMUN\b/g, "MINIMUM")
    .replace(/\bDEPATURE\b/g, "DEPARTURE")
    .replace(/\bO'?CLOCK\b/g, "OCLOCK")
    .replace(/\b(NORTH|SOUTH|EAST|WEST|NORTHEAST|NORTHWEST|SOUTHEAST|SOUTHWEST)BOUND\b/g, "$1 BOUND")
    .replace(/\b(RUNWAY|RWY)(\d{1,2})([LRC]?)\b/g, "$1 $2$3");
  phrase = phrase.replace(/\bF\s+L\s+(\d{2,3})\b/g, "FL $1");
  phrase = phrase.replace(/\b(FLIGHT\s+LEVEL|FL)\s+(\d)\s+(\d)\s+(\d)\b/g, "$1 $2$3$4");
  phrase = phrase.replace(/\b(FLIGHT\s+LEVEL|FL)\s+(\d)\s+(\d{2})\b/g, "$1 $2$3");
  phrase = phrase.replace(/\b(FLIGHT\s+LEVEL|FL)\s*(\d{2,3})\b/g, (_match, _label: string, level: string) => {
    return String(Number.parseInt(level, 10) * 100);
  });
  phrase = phrase.replace(/\b(HEADING|HDG)\s+(\d)\s+(\d)\s+(\d)\b/g, "$1 $2$3$4");
  phrase = phrase.replace(/\b(HEADING|HDG)\s+(\d)\s+(\d{2})\b/g, "$1 $2$3");
  phrase = phrase.replace(
    /\b(SPEED|SPD|REDUCE|REDUCE SPEED|REDUCE SPEED TO|REDUCE TO|MAINTAIN SPEED|INCREASE|INCREASE SPEED|INCREASE SPEED TO|INCREASE TO)\s+(\d)\s+(\d)\s+(\d)\b/g,
    "$1 $2$3$4"
  );
  phrase = phrase.replace(
    /\b(SPEED|SPD|REDUCE|REDUCE SPEED|REDUCE SPEED TO|REDUCE TO|MAINTAIN SPEED|INCREASE|INCREASE SPEED|INCREASE SPEED TO|INCREASE TO)\s+(\d)\s+(\d{2})\b/g,
    "$1 $2$3"
  );
  phrase = phrase.replace(/\b(RUNWAY|RWY)\s+(\d)\s+(\d)([LRC]?)\b/g, "$1 $2$3$4");
  phrase = phrase.replace(
    /\b((?:DESCEND|CLIMB)(?:\s+AND\s+MAINTAIN)?|MAINTAIN|PASSING|TO)\s+([1-9])\s+(\d)\s+(\d)\s+(\d)(?:\s+(\d))?\b/g,
    (_match, prefix: string, first: string, second: string, third: string, fourth: string, fifth?: string) =>
      `${prefix} ${first}${second}${third}${fourth}${fifth ?? ""}`
  );
  phrase = phrase.replace(
    /\b((?:DESCEND|CLIMB)(?:\s+AND\s+MAINTAIN)?|MAINTAIN|PASSING|TO)\s+([1-9]\d?)\s+(\d{3,4})\b/g,
    (_match, prefix: string, first: string, rest: string) => `${prefix} ${first}${rest}`
  );
  phrase = phrase.replace(
    /\b((?:DESCEND|CLIMB)\s+RATE|VERTICAL\s+SPEED)\s+(\d)\s+(\d{3})\b/g,
    (_match, prefix: string, first: string, rest: string) => `${prefix} ${first}${rest}`
  );

  return phrase.replace(/\s+/g, " ").trim();
}

const atcCommandPreamblePatterns: Array<{
  pattern: RegExp;
  token: string;
  unit?: "APP" | "DEP";
  radarContact?: boolean;
}> = [
  { pattern: /^(?:JEJU\s+)?APPROACH(?:\s+CONTROL)?\b/, token: "JEJU APPROACH", unit: "APP" },
  { pattern: /^(?:JEJU\s+)?APP\b/, token: "JEJU APP", unit: "APP" },
  { pattern: /^JEJU\s+RADAR\b/, token: "JEJU RADAR", unit: "APP" },
  { pattern: /^(?:JEJU\s+)?DEPARTURE(?:\s+CONTROL)?\b/, token: "JEJU DEPARTURE", unit: "DEP" },
  { pattern: /^(?:JEJU\s+)?DEP\b/, token: "JEJU DEP", unit: "DEP" },
  { pattern: /^제주\s*(?:어프로치|접근관제|접근)\b/u, token: "JEJU APPROACH", unit: "APP" },
  { pattern: /^제주\s*(?:디파쳐|디파처|출발관제|출발)\b/u, token: "JEJU DEPARTURE", unit: "DEP" },
  { pattern: /^RADAR\s+CONTACT(?:ED)?\b/, token: "RADAR CONTACT", radarContact: true },
  { pattern: /^IDENTIFIED\b/, token: "IDENTIFIED", radarContact: true },
  { pattern: /^(?:레이더|레이다)\s*(?:컨택|콘택트|콘텍트)\b/u, token: "RADAR CONTACT", radarContact: true },
  { pattern: /^식별(?:됨)?\b/u, token: "IDENTIFIED", radarContact: true }
];

export function stripAtcCommandPreamble(rawBody: string) {
  return stripAtcCommandPreambleWithInfo(rawBody).body;
}

export function stripAtcCommandPreambleWithInfo(rawBody: string): {
  body: string;
  preamble: AtcCommandPreambleInfo;
} {
  let body = normalizeAtcPhrase(rawBody);
  const preamble: AtcCommandPreambleInfo = {
    present: false,
    stripped_tokens: []
  };
  let changed = true;

  while (changed) {
    const before = body;
    body = body.replace(/^AND\s+/, "").trim();

    for (const entry of atcCommandPreamblePatterns) {
      if (!entry.pattern.test(body)) {
        continue;
      }

      body = body.replace(entry.pattern, "").trim();
      body = body.replace(/^AND\s+/, "").trim();
      preamble.present = true;
      preamble.stripped_tokens.push(entry.token);
      preamble.unit = preamble.unit ?? entry.unit;
      preamble.radar_contact = preamble.radar_contact || entry.radarContact || false;
    }

    body = body.replace(/\s+/g, " ").trim();
    changed = body !== before;
  }

  return { body, preamble };
}

export function parseAtcCommand(rawPhrase: string): ParsedAtcCommand {
  const normalizedPhrase = normalizeAtcPhrase(rawPhrase);
  const negativePrefix = stripNegativeCorrectionBeforeCallsign(normalizedPhrase);
  const split = splitCallsign(negativePrefix.phrase);
  const callsign = split.callsign;
  const correctionSplit = stripNegativeCorrectionAfterCallsign(split.body);
  const { body, preamble } = stripAtcCommandPreambleWithInfo(correctionSplit.body);
  const readbackCorrection = negativePrefix.readbackCorrection || correctionSplit.readbackCorrection;

  if (preamble.present && !body) {
    return {
      ok: true,
      callsign,
      body,
      preamble,
      intent: "FIRST_CONTACT_ACK",
      category: "RADIO",
      pattern_id: "first_contact_preamble",
      matched_pattern: preamble.radar_contact ? "RADAR CONTACT" : "FIRST CONTACT",
      slots: {
        ...(preamble.unit ? { unit: preamble.unit } : {}),
        ...(preamble.radar_contact ? { radar_contact: true } : {}),
        ...(readbackCorrection ? { readback_correction: true } : {})
      }
    };
  }

  for (const grammarEntry of grammar) {
    for (const pattern of grammarEntry.patterns) {
      const regex = compilePattern(pattern);
      const match = body.match(regex);

      if (!match) {
        continue;
      }

      return applySemanticModifiers({
        ok: true,
        callsign,
        body,
        preamble,
        intent: grammarEntry.intent,
        category: grammarEntry.category,
        pattern_id: grammarEntry.id,
        matched_pattern: pattern,
        slots: {
          ...coerceSlots(match.groups),
          ...(readbackCorrection ? { readback_correction: true } : {})
        }
      });
    }
  }

  return {
    ok: false,
    callsign,
    body,
    preamble,
    intent: null,
    category: null,
    pattern_id: null,
    matched_pattern: null,
    slots: {},
    error: "NO_PATTERN_MATCH"
  };
}

function stripNegativeCorrectionBeforeCallsign(phrase: string) {
  const match = phrase.match(/^NEGATIVE\s+([A-Z]{2,3}\d{2,4})\s+(?:CORRECTION\s+)?(.+)$/);

  if (!match) {
    return { phrase, readbackCorrection: false };
  }

  return {
    phrase: `${match[1]} ${match[2]}`.trim(),
    readbackCorrection: true
  };
}

function stripNegativeCorrectionAfterCallsign(body: string) {
  const match = normalizeAtcPhrase(body).match(/^NEGATIVE\s+(?:CORRECTION\s+)?(.+)$/);

  if (!match) {
    return { body, readbackCorrection: false };
  }

  return {
    body: match[1].trim(),
    readbackCorrection: true
  };
}

export function pilotReadbackForParsedCommand(parsed: ParsedAtcCommand) {
  const callsign = parsed.callsign ?? "";
  const slots = parsed.slots;

  switch (parsed.intent) {
    case "MAINTAIN_PRESENT_HEADING":
      return `Present heading, ${callsign}`;
    case "ASSIGN_HEADING":
      return `${turnPrefix(slots.turn_direction)}heading ${formatHeading(slots.heading_deg)}, ${callsign}`;
    case "ONE_CIRCLE_HEADING":
      return `${turnPrefix(slots.turn_direction)}one circle heading ${formatHeading(slots.heading_deg)}, ${callsign}`;
    case "ASSIGN_SPEED":
      return `Speed ${slots.speed_kt}, ${callsign}`;
    case "SPEED_UNTIL_FIX":
      return `Speed ${slots.speed_kt} until ${slots.fix_id}, ${callsign}`;
    case "SPEED_UNTIL_FIX_THEN_NORMAL":
      return `Speed ${slots.speed_kt} until ${slots.fix_id}, then normal speed, ${callsign}`;
    case "MAXIMUM_FORWARD_SPEED":
      return `Maximum forward speed, ${callsign}`;
    case "MINIMUM_SPEED":
      return `Minimum speed, ${callsign}`;
    case "MAINTAIN_SPEED_LIMIT":
      return `Speed ${slots.speed_kt} ${speedLimitText(slots.speed_limit_direction)}, ${callsign}`;
    case "MAINTAIN_SPEED_UNTIL":
      return `Maintain speed ${slots.speed_kt} or greater until ${slots.release_condition_text ?? "release"}, ${callsign}`;
    case "RESUME_NORMAL_SPEED":
      return `Resume normal speed, ${callsign}`;
    case "ASSIGN_ALTITUDE":
      if (Array.isArray(slots.altitude_ft_options)) {
        return `${altitudeVerb(parsed)} ${slots.altitude_ft_options.map(formatAltitude).join(" or ")}, ${callsign}`;
      }
      return `${altitudeVerb(parsed)} ${formatAltitude(slots.altitude_ft)}, ${callsign}`;
    case "CROSS_FIX_RESTRICTION":
      return `Cross ${slots.fix_id} ${crossingRestrictionText(slots.restriction)} ${formatAltitude(slots.altitude_ft)}, ${callsign}`;
    case "ASSIGN_VERTICAL_SPEED":
      return `Vertical speed ${slots.vertical_rate_fpm}, ${callsign}`;
    case "INCREASE_DESCENT_RATE":
      return `Increase descent rate, ${callsign}`;
    case "INCREASE_CLIMB_RATE":
      return `Increase climb rate, ${callsign}`;
    case "RESUME_NORMAL_CLIMB":
      return `Resume normal climb, ${callsign}`;
    case "RESUME_NORMAL_DESCENT":
      return `Resume normal descent, ${callsign}`;
    case "DIRECT_TO_FIX":
      return `Direct ${slots.fix_id}${directAltitudeText(slots)}${cancelLevelText(slots)}, ${callsign}`;
    case "TURN_DIRECT_FIX":
      return `${turnPrefix(slots.turn_direction)}direct ${slots.fix_id}, ${callsign}`;
    case "CLEARED_ILS":
      return `Cleared ILS runway ${slots.runway}, ${callsign}`;
    case "CLEARED_VISUAL_APPROACH":
      return `Cleared visual approach runway ${slots.runway}, ${callsign}`;
    case "DESCEND_VIA":
      return `Descend via${descendViaText(slots)}, ${callsign}`;
    case "CANCEL_LEVEL_RESTRICTION":
      return typeof slots.fix_id === "string"
        ? `Cancel ${slots.fix_id} level restriction, ${callsign}`
        : `Cancel level restriction, ${callsign}`;
    case "CANCEL_SPEED_RESTRICTION":
      return typeof slots.fix_id === "string"
        ? `Cancel ${slots.fix_id} speed restriction, ${callsign}`
        : `Cancel speed restriction, ${callsign}`;
    case "AFFIRM":
      return callsign ? `Affirm, ${callsign}` : "Affirm";
    case "NEGATIVE":
      return callsign ? `Negative, ${callsign}` : "Negative";
    case "EXPEDITE_DESCENT":
      return `Expedite descent, ${callsign}`;
    case "EXPEDITE_CLIMB":
      return `Expedite climb, ${callsign}`;
    case "TRAFFIC_INFORMATION":
      return `Traffic ${slots.clock_position} o'clock, ${slots.distance_nm} mile, ${String(slots.direction_bound ?? "").toLowerCase()}bound, ${formatAltitude(slots.altitude_ft)}, ${callsign}`;
    case "ASK_INTENTIONS":
      return `Request one more approach, ${callsign}`;
    case "SEQUENCE_NUMBER":
      return `Number ${slots.sequence_number}, ${callsign}`;
    case "CONFIRM_CALLSIGN":
      return "Callsign";
    case "FIRST_CONTACT_ACK":
      return parsed.preamble?.radar_contact ? `Radar contact, ${callsign}` : `Go ahead, ${callsign}`;
    case "RADIO_STANDBY":
      return `Standby, ${callsign}`;
    case "CONTACT_FREQUENCY":
      return `Contact ${formatFacility(slots.facility)} ${formatFrequency(slots.frequency_mhz)}, ${callsign}`;
    case "HOLD_AT_FIX":
      return `${holdReadbackPrefix(slots)}${holdInstructionText(slots)}, ${callsign}`;
    default:
      return `${callsign}, unable.`;
  }
}

export function atcCommandSummary(parsed: ParsedAtcCommand) {
  if (!parsed.intent) {
    return parsed.body || "instruction";
  }

  return pilotReadbackForParsedCommand(parsed).replace(/,\s*[A-Z]{2,3}\d{2,4}$/i, "");
}

function splitCallsign(normalizedPhrase: string) {
  const match = normalizedPhrase.match(/^([A-Z]{2,3}\d{2,4})\s+(.+)$/);

  if (!match) {
    return {
      callsign: null,
      body: normalizedPhrase
    };
  }

  return {
    callsign: match[1],
    body: match[2]
  };
}

function escapeRegex(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compilePattern(pattern: string) {
  const parts: string[] = [];
  let cursor = 0;
  const placeholderPattern = /\{([a-zA-Z0-9_]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = placeholderPattern.exec(pattern)) !== null) {
    parts.push(escapeRegex(pattern.slice(cursor, match.index)));
    const placeholderName = match[1];
    parts.push(placeholderRegex.get(placeholderName) ?? `(?<${placeholderName}>[A-Z0-9_\\-]+)`);
    cursor = match.index + match[0].length;
  }

  parts.push(escapeRegex(pattern.slice(cursor)));
  const patternSource = parts
    .join("")
    .replace(/\bTURNS\b/g, "TURNS?")
    .replace(/\bLEGS\b/g, "LEGS?")
    .replace(/\bMINUTE\b/g, "MINUTES?");

  return new RegExp(`^${patternSource}$`, "i");
}

function coerceSlots(groups: Record<string, string | undefined> = {}) {
  const slots: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(groups)) {
    if (value === undefined || value === "") {
      continue;
    }

    if (key === "heading_deg" || key === "inbound_heading_deg") {
      slots[key] = value.length === 2 ? Number.parseInt(value, 10) * 10 : Number.parseInt(value, 10);
    } else if (key === "speed_kt") {
      slots[key] = value.length === 2 ? Number.parseInt(value, 10) * 10 : Number.parseInt(value, 10);
    } else if (key === "altitude_ft" || key === "altitude_ft_alt" || key === "traffic_altitude_ft" || key === "target_altitude_ft") {
      const altitude = Number.parseInt(value, 10);
      slots[key] = altitude < 1000 ? altitude * 100 : altitude;
    } else if (key === "frequency_mhz") {
      slots[key] = value.replace(/\s+/g, ".");
    } else if (key === "sequence_number" || key === "clock_position" || key === "distance_nm") {
      slots[key] = Number.parseInt(value, 10);
    } else if (key === "vertical_rate_fpm") {
      slots[key] = Number.parseInt(value, 10);
    } else if (key === "leg_time_minutes") {
      slots[key] = legTimeWordValues[value.toUpperCase()] ?? Number.parseFloat(value);
    } else {
      slots[key] = value.toUpperCase();
    }
  }

  return slots;
}

function applySemanticModifiers(parsed: ParsedAtcCommand): ParsedAtcCommand {
  if (parsed.intent === "MAINTAIN_PRESENT_HEADING") {
    const matchedPattern = parsed.matched_pattern ?? "";

    if (matchedPattern === "MAINTAIN HEADING") {
      return {
        ...parsed,
        slots: {
          ...parsed.slots,
          requires_confirmation: true,
          confirmation_required_reason: "ambiguous maintain heading command"
        }
      };
    }

    return parsed;
  }

  if (parsed.intent === "ONE_CIRCLE_HEADING") {
    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        circle_count: 1
      }
    };
  }

  if (parsed.intent === "MAINTAIN_SPEED_LIMIT") {
    const matchedPattern = parsed.matched_pattern ?? "";
    const direction = matchedPattern.includes("OR LESS") ? "or_less" : "or_greater";

    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        speed_limit_direction: direction,
        speed_policy: {
          type: direction === "or_less" ? "maximum_speed_ceiling" : "minimum_speed_floor",
          comparator: direction,
          speed_kt: parsed.slots.speed_kt
        }
      }
    };
  }

  if (parsed.intent === "ASSIGN_SPEED") {
    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        speed_policy: {
          type: "target",
          speed_kt: parsed.slots.speed_kt
        }
      }
    };
  }

  if (parsed.intent === "SPEED_UNTIL_FIX" || parsed.intent === "SPEED_UNTIL_FIX_THEN_NORMAL") {
    const releaseCondition = typeof parsed.slots.fix_id === "string"
      ? {
          type: "passing_fix",
          fix_id: parsed.slots.fix_id
        }
      : null;

    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        release_condition: releaseCondition,
        release_condition_text: speedReleaseConditionText(releaseCondition),
        resume_normal_speed_after_fix: parsed.intent === "SPEED_UNTIL_FIX_THEN_NORMAL",
        speed_policy: {
          type: "target",
          speed_kt: parsed.slots.speed_kt,
          release_condition: releaseCondition
        }
      }
    };
  }

  if (parsed.intent === "MAXIMUM_FORWARD_SPEED") {
    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        speed_kt: 310,
        speed_policy: {
          type: "target",
          speed_kt: 310,
          maximum_forward_speed: true
        }
      }
    };
  }

  if (parsed.intent === "MINIMUM_SPEED") {
    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        speed_kt: MINIMUM_SPEED_TARGET_KT,
        speed_policy: {
          type: "minimum_practical_speed",
          speed_kt: MINIMUM_SPEED_TARGET_KT
        }
      }
    };
  }

  if (parsed.intent === "ASSIGN_ALTITUDE" && typeof parsed.slots.altitude_ft_alt === "number") {
    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        altitude_ft_options: [parsed.slots.altitude_ft, parsed.slots.altitude_ft_alt],
        requires_confirmation: true,
        confirmation_required_reason: "ambiguous altitude"
      }
    };
  }

  if (parsed.intent === "CROSS_FIX_RESTRICTION") {
    const matchedPattern = parsed.matched_pattern ?? "";

    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        restriction: matchedPattern.includes("AT OR BELOW") ? "AT_OR_BELOW" : "BELOW"
      }
    };
  }

  if (parsed.intent === "TRAFFIC_INFORMATION") {
    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        altitude_ft: parsed.slots.traffic_altitude_ft
      }
    };
  }

  if (parsed.intent === "ASSIGN_VERTICAL_SPEED") {
    const verticalRate = typeof parsed.slots.vertical_rate_fpm === "number"
      ? parsed.slots.vertical_rate_fpm
      : null;

    if (verticalRate === null) {
      return parsed;
    }

    const matchedPattern = parsed.matched_pattern ?? "";
    const signedVerticalRate = matchedPattern.startsWith("DESCEND")
      ? -Math.abs(verticalRate)
      : matchedPattern.startsWith("CLIMB")
        ? Math.abs(verticalRate)
        : verticalRate;

    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        vertical_rate_fpm: signedVerticalRate
      }
    };
  }

  if (parsed.intent === "MAINTAIN_SPEED_UNTIL") {
    const releaseCondition = typeof parsed.slots.altitude_ft === "number"
      ? {
          type: "passing_altitude",
          altitude_ft: parsed.slots.altitude_ft
        }
      : typeof parsed.slots.fix_id === "string"
        ? {
            type: "passing_fix",
            fix_id: parsed.slots.fix_id
          }
        : null;

    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        release_condition: releaseCondition,
        release_condition_text: speedReleaseConditionText(releaseCondition),
        speed_policy: {
          type: "minimum_speed_floor",
          comparator: "or_greater",
          speed_kt: parsed.slots.speed_kt,
          release_condition: releaseCondition
        }
      }
    };
  }

  if (parsed.intent === "CANCEL_LEVEL_RESTRICTION") {
    const fixId = typeof parsed.slots.fix_id === "string" ? parsed.slots.fix_id : null;

    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        cancel_level_restriction: {
          scope: fixId ? "APP_FIX" : "APP_ALL",
          ...(fixId ? { fix_id: fixId } : {}),
          requires_confirmation: !fixId
        },
        ...(fixId
          ? {}
          : {
              confirmation_required_reason:
                "missing fix scope for approach level restriction cancellation"
            })
      }
    };
  }

  if (parsed.intent === "CANCEL_SPEED_RESTRICTION") {
    const fixId = typeof parsed.slots.fix_id === "string" ? parsed.slots.fix_id : null;

    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        cancel_speed_restriction: {
          scope: fixId ? "FIX" : "ACTIVE_NEXT",
          ...(fixId ? { fix_id: fixId } : {}),
          requires_confirmation: !fixId
        },
        ...(fixId
          ? {}
          : {
              confirmation_required_reason:
                "missing fix scope for speed restriction cancellation"
            })
      }
    };
  }

  if (parsed.intent === "DIRECT_TO_FIX") {
    const matchedPattern = parsed.matched_pattern ?? "";
    const fixId = typeof parsed.slots.fix_id === "string" ? parsed.slots.fix_id : undefined;

    if (!matchedPattern.includes("CANCEL LEVEL")) {
      return parsed;
    }

    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        cancel_level_restriction: {
          scope: "DIRECT_FIX",
          ...(fixId ? { fix_id: fixId } : {})
        },
        constraint_policy: {
          lateral_path: "direct",
          speed_restrictions: "none",
          altitude_restrictions: "cancel_previous_procedure_restrictions"
        }
      }
    };
  }

  if (parsed.intent === "HOLD_AT_FIX") {
    const matchedPattern = parsed.matched_pattern ?? "";
    const holdFixId = typeof parsed.slots.hold_fix_id === "string"
      ? parsed.slots.hold_fix_id
      : parsed.slots.fix_id;

    return {
      ...parsed,
      slots: {
        ...parsed.slots,
        ...(typeof holdFixId === "string" ? { fix_id: holdFixId } : {}),
        hold_as_published: matchedPattern.includes("AS PUBLISHED"),
        hold_at_present_position: matchedPattern.includes("PRESENT POSITION"),
        hold_over_fix: matchedPattern.startsWith("HOLD OVER"),
        direct_to_hold:
          matchedPattern.startsWith("DIRECT") ||
          matchedPattern.startsWith("PROCEED DIRECT")
      }
    };
  }

  if (parsed.intent === "CONTACT_FREQUENCY") {
    const facility = String(parsed.slots.facility ?? "").toUpperCase();

    if (
      !parsed.slots.frequency_mhz &&
      (facility === "TOWER" || facility === "JEJU TOWER")
    ) {
      return {
        ...parsed,
        slots: {
          ...parsed.slots,
          frequency_mhz: "118.2",
          default_frequency: true
        }
      };
    }
  }

  if (parsed.intent !== "DESCEND_VIA") {
    return parsed;
  }

  const matchedPattern = parsed.matched_pattern ?? "";
  const cancelLevelRestriction = matchedPattern.includes("CANCEL LEVEL");

  return {
    ...parsed,
    slots: {
      ...parsed.slots,
      constraint_policy: {
        lateral_path: "follow",
        speed_restrictions: "follow",
        altitude_restrictions: cancelLevelRestriction ? "cancel_star" : "follow_star"
      },
      ...(cancelLevelRestriction
        ? {
            cancel_level_restriction: {
              scope: "STAR"
            }
          }
        : {})
    }
  };
}

function turnPrefix(turnDirection: unknown) {
  return turnDirection === "LEFT" || turnDirection === "RIGHT"
    ? `${String(turnDirection).toLowerCase()} turn `
    : "";
}

function formatHeading(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value).padStart(3, "0")
    : "";
}

function formatAltitude(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "";
  }

  return value >= 18000 ? `flight level ${Math.round(value / 100)}` : `${Math.round(value)} feet`;
}

function altitudeVerb(parsed: ParsedAtcCommand) {
  if (parsed.matched_pattern?.startsWith("CLIMB")) {
    return "Climb";
  }

  if (parsed.matched_pattern?.startsWith("DESCEND")) {
    return "Descend";
  }

  return "Maintain";
}

function speedLimitText(value: unknown) {
  return value === "or_greater" ? "or greater" : "or less";
}

function crossingRestrictionText(value: unknown) {
  return value === "AT_OR_BELOW" ? "at or below" : "below";
}

function speedReleaseConditionText(value: unknown) {
  if (!value || typeof value !== "object") {
    return "release";
  }

  const releaseCondition = value as { type?: unknown; altitude_ft?: unknown; fix_id?: unknown };

  if (
    releaseCondition.type === "passing_altitude" &&
    typeof releaseCondition.altitude_ft === "number"
  ) {
    return `passing ${formatAltitude(releaseCondition.altitude_ft)}`;
  }

  if (releaseCondition.type === "passing_fix" && typeof releaseCondition.fix_id === "string") {
    return releaseCondition.fix_id;
  }

  return "release";
}

function formatFacility(value: unknown) {
  return String(value ?? "frequency").toLowerCase();
}

function formatFrequency(value: unknown) {
  const text = String(value ?? "").trim();
  return text || "frequency";
}

function descendViaText(slots: Record<string, unknown>) {
  const parts: string[] = [];

  if (typeof slots.fix_id === "string") {
    parts.push(slots.fix_id);
  }

  if (typeof slots.procedure_compact === "string") {
    parts.push(slots.procedure_compact);
  } else if (
    typeof slots.procedure_number_word === "string" &&
    typeof slots.procedure_suffix_word === "string"
  ) {
    parts.push(`${slots.procedure_number_word} ${slots.procedure_suffix_word}`);
  } else if (typeof slots.procedure_id === "string") {
    parts.push(slots.procedure_id);
  }

  if (typeof slots.altitude_ft === "number") {
    parts.push(`to ${formatAltitude(slots.altitude_ft)}`);
  }

  if (slots.cancel_level_restriction) {
    parts.push("cancel level restriction");
  }

  return parts.length > 0 ? ` ${parts.join(" ")}` : "";
}

function directAltitudeText(slots: Record<string, unknown>) {
  return typeof slots.altitude_ft === "number" ? `, descend ${formatAltitude(slots.altitude_ft)}` : "";
}

function cancelLevelText(slots: Record<string, unknown>) {
  return slots.cancel_level_restriction ? ", cancel level restriction" : "";
}

function holdInstructionText(slots: Record<string, unknown>) {
  const parts: string[] = [];

  if (slots.hold_as_published) {
    parts.push("as published");
  }

  if (typeof slots.inbound_heading_deg === "number" && Number.isFinite(slots.inbound_heading_deg)) {
    parts.push(`inbound heading ${formatHeading(slots.inbound_heading_deg)}`);
  }

  if (typeof slots.turn_direction === "string") {
    parts.push(`${slots.turn_direction.toLowerCase()} turns`);
  }

  if (typeof slots.leg_time_minutes === "number" && Number.isFinite(slots.leg_time_minutes)) {
    parts.push(`${slots.leg_time_minutes} minute legs`);
  }

  if (typeof slots.altitude_ft === "number" && Number.isFinite(slots.altitude_ft)) {
    parts.push(`maintain ${formatAltitude(slots.altitude_ft)}`);
  }

  if (typeof slots.speed_kt === "number" && Number.isFinite(slots.speed_kt)) {
    parts.push(`speed ${slots.speed_kt}`);
  }

  return parts.length > 0 ? `, ${parts.join(", ")}` : "";
}

function holdReadbackPrefix(slots: Record<string, unknown>) {
  const fixId = typeof slots.fix_id === "string" ? slots.fix_id : undefined;

  if (slots.hold_at_present_position) {
    return "Hold present position";
  }

  if (slots.direct_to_hold && fixId) {
    return `Direct ${fixId}, hold`;
  }

  if (slots.hold_over_fix && fixId) {
    return `Hold over ${fixId}`;
  }

  return fixId ? `Hold at ${fixId}` : "Hold";
}
