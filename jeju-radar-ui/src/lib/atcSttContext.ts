import { callsignTelephonyText, sanitizeCallsign } from "./callsignTelephony";
import type { AircraftState, ProcedureRecord, RadarDataset, RunwayMode } from "./types";

export interface AtcSttContext {
  prompt: string;
  display: string;
  callsigns: string[];
  fixes: string[];
  procedures: string[];
}

interface AtcSttContextInput {
  aircraft: AircraftState[];
  dataset: RadarDataset;
  selectedRunway: RunwayMode;
  maxCallsigns?: number;
  maxFixes?: number;
  maxProcedures?: number;
  maxPromptLength?: number;
}

const DEFAULT_MAX_CALLSIGNS = 10;
const DEFAULT_MAX_FIXES = 24;
const DEFAULT_MAX_PROCEDURES = 12;
const DEFAULT_MAX_PROMPT_LENGTH = 1400;

const defaultCommandHints = [
  "speed",
  "reduce speed to",
  "speed or less",
  "speed or greater",
  "maintain speed",
  "maintain speed or greater until",
  "minimum speed",
  "resume normal speed",
  "heading",
  "fly heading",
  "fly present heading",
  "maintain present heading",
  "turn left one circle heading",
  "turn right one circle heading",
  "direct",
  "direct to",
  "turn left direct",
  "left turn direct",
  "proceed direct to",
  "descend",
  "descend to",
  "climb",
  "climb to",
  "vertical speed",
  "descend rate",
  "descend via",
  "cancel level restriction",
  "cancel speed restriction",
  "cleared ILS",
  "cleared ILS Z runway",
  "cross at or below",
  "cross below",
  "traffic",
  "you are number",
  "sequence number",
  "say intentions",
  "confirm one more approach",
  "affirm",
  "negative",
  "negative correction"
];

export function buildAtcSttContext(input: AtcSttContextInput): AtcSttContext {
  const callsigns = prioritizedCallsigns(input.aircraft).slice(0, input.maxCallsigns ?? DEFAULT_MAX_CALLSIGNS);
  const procedures = runwayProcedureHints(input.dataset, input.selectedRunway).slice(
    0,
    input.maxProcedures ?? DEFAULT_MAX_PROCEDURES
  );
  const fixes = prioritizedFixes(input).slice(0, input.maxFixes ?? DEFAULT_MAX_FIXES);
  const callSignHints = callsigns.map(callsignHintText);

  const promptParts = [
    "Current Jeju RKPC ATC context. Prefer these exact aviation spellings over common English words.",
    callSignHints.length > 0 ? `Active callsigns: ${callSignHints.join("; ")}.` : "",
    `Runway mode: RWY ${input.selectedRunway}.`,
    fixes.length > 0 ? `Likely fixes: ${fixes.join(", ")}.` : "",
    procedures.length > 0 ? `Likely procedures: ${procedures.join(", ")}.` : "",
    `Likely commands: ${defaultCommandHints.join(", ")}.`,
    "Return only the ATC command text with ICAO callsigns, fix IDs, digits, runway numbers, and procedure suffixes."
  ].filter(Boolean);

  const prompt = truncatePrompt(promptParts.join(" "), input.maxPromptLength ?? DEFAULT_MAX_PROMPT_LENGTH);
  const displayParts = [
    callsigns.slice(0, 4).join(" "),
    fixes.slice(0, 6).join(" "),
    procedures.slice(0, 3).join(" / ")
  ].filter(Boolean);

  return {
    prompt,
    display: displayParts.join(" | "),
    callsigns,
    fixes,
    procedures
  };
}

function prioritizedCallsigns(aircraft: AircraftState[]) {
  const sortedAircraft = [...aircraft].sort((first, second) => {
    const firstPriority = aircraftSpeechPriority(first);
    const secondPriority = aircraftSpeechPriority(second);

    return secondPriority - firstPriority || sanitizeCallsign(first.callsign).localeCompare(sanitizeCallsign(second.callsign));
  });

  return uniqueStrings(sortedAircraft.map((target) => sanitizeCallsign(target.callsign)).filter(Boolean));
}

function aircraftSpeechPriority(aircraft: AircraftState) {
  let priority = 0;

  if (aircraft.owner_position === "APP") {
    priority += 4;
  } else if (aircraft.owner_position === "DEP") {
    priority += 3;
  }

  if (aircraft.route_mode === "procedure") {
    priority += 2;
  }

  if (aircraft.flight_phase === "arrival") {
    priority += 1;
  }

  return priority;
}

function callsignHintText(callsign: string) {
  const normalizedCallsign = sanitizeCallsign(callsign);
  const telephonyText = callsignTelephonyText(normalizedCallsign);

  return telephonyText !== normalizedCallsign ? `${normalizedCallsign} = ${telephonyText}` : normalizedCallsign;
}

function runwayProcedureHints(dataset: RadarDataset, selectedRunway: RunwayMode) {
  const procedureGroups = [
    ...dataset.procedures.stars,
    ...dataset.procedures.sids,
    ...dataset.procedures.approaches
  ];

  return uniqueStrings(
    procedureGroups
      .filter((procedure) => procedureAppliesToRunway(procedure, selectedRunway))
      .flatMap((procedure) => procedureHintVariants(procedure))
  );
}

function procedureAppliesToRunway(procedure: ProcedureRecord, selectedRunway: RunwayMode) {
  return (
    procedure.runway === selectedRunway ||
    procedure.paired_runway_mode === selectedRunway ||
    (selectedRunway === "25" && procedure.runway === "31")
  );
}

function procedureHintVariants(procedure: ProcedureRecord) {
  const variants = new Set<string>();
  const id = procedure.id.toUpperCase();
  const name = procedure.name.toUpperCase();

  variants.add(simplifyProcedureText(name));

  if (id.includes("ILS") || name.includes("ILS")) {
    variants.add(`ILS Z RWY ${procedure.runway}`);
  }

  const arrivalMatch = name.match(/\b([A-Z]{3,6})\s+(\d+[A-Z])\b/);
  if (arrivalMatch) {
    variants.add(`${arrivalMatch[1]} ${arrivalMatch[2]} ARRIVAL`);
  }

  const idMatch = id.match(/\b([A-Z]{3,6})_(\d+[A-Z])\b/);
  if (idMatch) {
    variants.add(`${idMatch[1]} ${idMatch[2]}`);
  }

  return [...variants].filter(Boolean);
}

function simplifyProcedureText(value: string) {
  return value
    .replace(/\bRNAV\b/g, "")
    .replace(/\bLOC\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function prioritizedFixes(input: AtcSttContextInput) {
  const knownFixes = new Set(input.dataset.procedures.fixes.map((fix) => fix.id.toUpperCase()));
  const fixes: string[] = [];

  for (const target of input.aircraft) {
    fixes.push(...aircraftRouteFixes(target));
  }

  for (const procedure of runwayProcedures(input.dataset, input.selectedRunway)) {
    fixes.push(...procedureRouteFixes(procedure));
  }

  fixes.push(...nearbyFixes(input.aircraft, input.dataset));
  fixes.push("YUMIN", "LIMSO", "DAKPI", "DOTOL", "DUKAL", "TOKIN", "MANBA", "PALRI");

  return uniqueStrings(fixes.map(normalizeFixId).filter((fixId) => knownFixes.has(fixId)));
}

function runwayProcedures(dataset: RadarDataset, selectedRunway: RunwayMode) {
  return [
    ...dataset.procedures.stars,
    ...dataset.procedures.sids,
    ...dataset.procedures.approaches
  ].filter((procedure) => procedureAppliesToRunway(procedure, selectedRunway));
}

function aircraftRouteFixes(aircraft: AircraftState) {
  return [
    aircraft.planned_entry_fix,
    aircraft.planned_exit_fix,
    aircraft.next_fix,
    ...(aircraft.procedure_route ?? [])
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

function procedureRouteFixes(procedure: ProcedureRecord) {
  return [
    ...(procedure.entry_fixes ?? []),
    ...(procedure.initial_fixes ?? []),
    ...(procedure.final_fixes ?? []),
    ...routeTextFixes(procedure.route_text ?? "")
  ];
}

function routeTextFixes(routeText: string) {
  return routeText
    .split(/[^A-Z0-9]+/i)
    .map(normalizeFixId)
    .filter((part) => /^[A-Z]{3,6}$/.test(part) || /^RW\d{2,3}$/.test(part));
}

function nearbyFixes(aircraft: AircraftState[], dataset: RadarDataset) {
  const nearby: Array<{ fixId: string; distanceNm: number }> = [];

  for (const target of aircraft.slice(0, 12)) {
    for (const fix of dataset.procedures.fixes) {
      const distanceNm = distanceNmBetween(target.latitude, target.longitude, fix.latitude, fix.longitude);

      if (distanceNm <= 45) {
        nearby.push({ fixId: fix.id, distanceNm });
      }
    }
  }

  return nearby
    .sort((first, second) => first.distanceNm - second.distanceNm)
    .map((entry) => entry.fixId);
}

function distanceNmBetween(firstLat: number, firstLon: number, secondLat: number, secondLon: number) {
  const earthRadiusNm = 3440.065;
  const firstLatRad = degreesToRadians(firstLat);
  const secondLatRad = degreesToRadians(secondLat);
  const deltaLat = degreesToRadians(secondLat - firstLat);
  const deltaLon = degreesToRadians(secondLon - firstLon);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(firstLatRad) * Math.cos(secondLatRad) * Math.sin(deltaLon / 2) ** 2;

  return earthRadiusNm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function degreesToRadians(value: number) {
  return (value * Math.PI) / 180;
}

function normalizeFixId(value: string) {
  return value.trim().toUpperCase();
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ");

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function truncatePrompt(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }

  const suffix = " Context truncated.";
  return `${value.slice(0, Math.max(0, maxLength - suffix.length)).trim()}${suffix}`;
}
