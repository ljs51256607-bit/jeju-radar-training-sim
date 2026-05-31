import { distanceNmBetweenPoints } from "./aircraftMotion";
import {
  callsignTelephonyText,
  digitsToTelephonyWords,
  sanitizeCallsign
} from "./callsignTelephony";
import type {
  AircraftState,
  PilotFirstContactRole,
  PilotFirstContactState,
  RadarDataset
} from "./types";

export const APP_FIRST_CONTACT_ENTRY_FIXES = [
  "DOTOL",
  "UPGOS",
  "TAMNA",
  "TOSAN",
  "SOSDO",
  "LIMDI",
  "IPDAS",
  "MAKET"
] as const;

export const DEP_FIRST_CONTACT_TRIGGER_ALTITUDE_FT = 1200;
export const MISSED_APP_FIRST_CONTACT_TRIGGER_ALTITUDE_FT = 1200;
export const RADIO_JAMMING_REPEAT_SUPPRESS_MS = 15000;
export const RADIO_JAMMING_RETRY_STAGGER_MS = 3000;

export interface PilotFirstContactEvent {
  aircraftId: string;
  callsign: string;
  role: PilotFirstContactRole;
  text: string;
  detail: string;
}

export interface PilotFirstContactEvaluation {
  aircraft: AircraftState;
  event: PilotFirstContactEvent;
}

export interface PilotRadioJammingEvent {
  aircraftIds: string[];
  callsigns: string[];
  text: string;
  detail: string;
}

export type PilotFirstContactBatchEvaluation =
  | { status: "none"; aircraftTraffic: AircraftState[] }
  | { status: "single"; aircraftTraffic: AircraftState[]; event: PilotFirstContactEvent }
  | { status: "jammed"; aircraftTraffic: AircraftState[]; event: PilotRadioJammingEvent };

export interface PilotFirstContactBatchOptions {
  radioExchangeBusy?: boolean;
}

export type PilotJammedCallsignConfirmation =
  | { status: "none"; aircraftTraffic: AircraftState[] }
  | { status: "confirmed"; aircraftTraffic: AircraftState[]; aircraftId: string; callsign: string; detail: string };

export type PilotJammedCallsignSayAgain =
  | { status: "none"; aircraftTraffic: AircraftState[] }
  | { status: "repeated"; aircraftTraffic: AircraftState[]; event: PilotFirstContactEvent };

const appEntryFixSet = new Set<string>(APP_FIRST_CONTACT_ENTRY_FIXES);

export function isAppFirstContactEntryFix(fixId: string) {
  return appEntryFixSet.has(normalizeFixId(fixId));
}

export function arrivalFirstContactProfile(
  entryFix: string,
  seed: string | number = entryFix
): PilotFirstContactState {
  return {
    role: "APP",
    trigger_fix: normalizeFixId(entryFix),
    trigger_distance_nm: deterministicEntryContactDistanceNm(seed)
  };
}

export function departureFirstContactProfile(): PilotFirstContactState {
  return {
    role: "DEP",
    trigger_altitude_ft: DEP_FIRST_CONTACT_TRIGGER_ALTITUDE_FT
  };
}

export function missedApproachFirstContactProfile(): PilotFirstContactState {
  return {
    role: "MISSED_APP",
    trigger_altitude_ft: MISSED_APP_FIRST_CONTACT_TRIGGER_ALTITUDE_FT
  };
}

export function evaluatePilotFirstContact(
  aircraft: AircraftState,
  dataset: RadarDataset,
  currentTimeMs: number
): PilotFirstContactEvaluation | null {
  const profile = firstContactProfileForAircraft(aircraft);

  if (!profile || profile.done) {
    return null;
  }

  if (profile.awaiting_controller_response) {
    return null;
  }

  if (firstContactRecentlyJammed(profile, currentTimeMs)) {
    return null;
  }

  if (profile.role === "APP") {
    return evaluateAppFirstContact(aircraft, dataset, profile, currentTimeMs);
  }

  if (profile.role === "MISSED_APP") {
    return evaluateMissedApproachFirstContact(aircraft, profile, currentTimeMs);
  }

  return evaluateDepFirstContact(aircraft, profile, currentTimeMs);
}

export function evaluatePilotFirstContactBatch(
  aircraftTraffic: AircraftState[],
  dataset: RadarDataset,
  currentTimeMs: number,
  options: PilotFirstContactBatchOptions = {}
): PilotFirstContactBatchEvaluation {
  if (options.radioExchangeBusy) {
    return { status: "none", aircraftTraffic };
  }

  if (aircraftTraffic.some(firstContactAwaitingControllerResponse)) {
    return { status: "none", aircraftTraffic };
  }

  let readyEvaluations: Array<{ index: number; original: AircraftState; evaluation: PilotFirstContactEvaluation }> = [];

  aircraftTraffic.forEach((aircraft, index) => {
    const evaluation = evaluatePilotFirstContact(aircraft, dataset, currentTimeMs);

    if (evaluation) {
      readyEvaluations.push({ index, original: aircraft, evaluation });
    }
  });

  const newestUnresolvedJamTimeMs = newestUnresolvedFirstContactJamTimeMs(aircraftTraffic);

  if (typeof newestUnresolvedJamTimeMs === "number") {
    const readyFromNewestJam = readyEvaluations.filter(
      ({ original }) => original.pilot_first_contact?.last_jammed_at_ms === newestUnresolvedJamTimeMs
    );

    if (readyFromNewestJam.length === 0) {
      return { status: "none", aircraftTraffic };
    }

    readyEvaluations = readyEvaluations.filter(({ original }) => {
      const lastJammedAtMs = original.pilot_first_contact?.last_jammed_at_ms;

      return (
        typeof lastJammedAtMs !== "number" ||
        lastJammedAtMs === newestUnresolvedJamTimeMs
      );
    });
  }

  if (readyEvaluations.length === 0) {
    return { status: "none", aircraftTraffic };
  }

  if (readyEvaluations.length === 1) {
    const [ready] = readyEvaluations;
    const aircraftTrafficWithContact = aircraftTraffic.map((aircraft, index) =>
      index === ready.index ? ready.evaluation.aircraft : aircraft
    );

    return {
      status: "single",
      aircraftTraffic: aircraftTrafficWithContact,
      event: ready.evaluation.event
    };
  }

  const jammedAircraftIds = readyEvaluations.map(({ original }) => original.id);
  const callsigns = readyEvaluations.map(({ evaluation }) => evaluation.event.callsign);
  const retryOrderByAircraftId = new Map(
    readyEvaluations.map(({ original }, retryIndex) => [original.id, retryIndex])
  );
  const aircraftTrafficWithJamming = aircraftTraffic.map((aircraft) => {
    const ready = readyEvaluations.find(({ original }) => original.id === aircraft.id);

    if (!ready) {
      return aircraft;
    }

    return markFirstContactJammed(
      ready.original,
      ready.evaluation.aircraft,
      currentTimeMs,
      retryOrderByAircraftId.get(ready.original.id) ?? 0
    );
  });

  return {
    status: "jammed",
    aircraftTraffic: aircraftTrafficWithJamming,
    event: {
      aircraftIds: jammedAircraftIds,
      callsigns,
      text: "ZZZZZT... blocked transmission.",
      detail: `radio jamming: ${callsigns.join(", ")} transmitted together`
    }
  };
}

export function confirmMostRecentJammedCallsign(
  aircraftTraffic: AircraftState[],
  currentTimeMs: number
): PilotJammedCallsignConfirmation {
  const candidate = mostRecentJammedFirstContactAircraft(aircraftTraffic);

  if (!candidate?.pilot_first_contact) {
    return { status: "none", aircraftTraffic };
  }

  const callsign = sanitizeCallsign(candidate.callsign);
  const retryAfterByAircraftId = remainingJammedRetryAfterByAircraftId(
    aircraftTraffic,
    candidate.id,
    currentTimeMs
  );
  const aircraftTrafficWithConfirmedCallsign = aircraftTraffic.map((aircraft) => {
    if (aircraft.id === candidate.id) {
      return markFirstContactCalled(aircraft, aircraft.pilot_first_contact!, currentTimeMs, callsign);
    }

    const retryAfterMs = retryAfterByAircraftId.get(aircraft.id);

    return retryAfterMs && aircraft.pilot_first_contact
      ? {
          ...aircraft,
          pilot_first_contact: {
            ...aircraft.pilot_first_contact,
            retry_after_ms: retryAfterMs
          }
        }
      : aircraft;
  });

  return {
    status: "confirmed",
    aircraftTraffic: aircraftTrafficWithConfirmedCallsign,
    aircraftId: candidate.id,
    callsign,
    detail: `${callsign} confirmed callsign after blocked transmission`
  };
}

export function requestMostRecentJammedCallsignSayAgain(
  aircraftTraffic: AircraftState[],
  dataset: RadarDataset,
  currentTimeMs: number
): PilotJammedCallsignSayAgain {
  const candidate = mostRecentJammedFirstContactAircraft(aircraftTraffic);
  const profile = candidate?.pilot_first_contact;

  if (!candidate || !profile) {
    return { status: "none", aircraftTraffic };
  }

  const event = repeatedFirstContactEventForAircraft(
    candidate,
    dataset,
    profile
  );

  if (!event) {
    return { status: "none", aircraftTraffic };
  }

  const retryAfterByAircraftId = remainingJammedRetryAfterByAircraftId(
    aircraftTraffic,
    candidate.id,
    currentTimeMs
  );

  return {
    status: "repeated",
    aircraftTraffic: aircraftTraffic.map((aircraft) => {
      if (aircraft.id === candidate.id) {
        return markFirstContactCalled(aircraft, profile, currentTimeMs, event.text);
      }

      const retryAfterMs = retryAfterByAircraftId.get(aircraft.id);

      return retryAfterMs && aircraft.pilot_first_contact
        ? {
            ...aircraft,
            pilot_first_contact: {
              ...aircraft.pilot_first_contact,
              retry_after_ms: retryAfterMs
            }
          }
        : aircraft;
    }),
    event
  };
}

export function requestJammedCallsignSayAgain(
  aircraftTraffic: AircraftState[],
  dataset: RadarDataset,
  currentTimeMs: number,
  callsign: string
): PilotJammedCallsignSayAgain {
  const normalizedCallsign = sanitizeCallsign(callsign);
  const targetAircraft = aircraftTraffic.find(
    (aircraft) => sanitizeCallsign(aircraft.callsign) === normalizedCallsign
  );
  const profile = targetAircraft?.pilot_first_contact;

  if (
    !targetAircraft ||
    !profile ||
    profile.done ||
    typeof profile.last_jammed_at_ms !== "number"
  ) {
    return { status: "none", aircraftTraffic };
  }

  const event = repeatedFirstContactEventForAircraft(
    targetAircraft,
    dataset,
    profile
  );

  if (!event) {
    return { status: "none", aircraftTraffic };
  }

  const retryAfterByAircraftId = remainingJammedRetryAfterByAircraftId(
    aircraftTraffic,
    targetAircraft.id,
    currentTimeMs
  );

  return {
    status: "repeated",
    aircraftTraffic: aircraftTraffic.map((aircraft) => {
      if (aircraft.id === targetAircraft.id) {
        return markFirstContactCalled(aircraft, profile, currentTimeMs, event.text);
      }

      const retryAfterMs = retryAfterByAircraftId.get(aircraft.id);

      return retryAfterMs && aircraft.pilot_first_contact
        ? {
            ...aircraft,
            pilot_first_contact: {
              ...aircraft.pilot_first_contact,
              retry_after_ms: retryAfterMs
            }
          }
        : aircraft;
    }),
    event
  };
}

function evaluateAppFirstContact(
  aircraft: AircraftState,
  dataset: RadarDataset,
  profile: PilotFirstContactState,
  currentTimeMs: number
): PilotFirstContactEvaluation | null {
  const triggerFixId = normalizeFixId(profile.trigger_fix ?? aircraft.planned_entry_fix ?? "");

  if (!isAppFirstContactEntryFix(triggerFixId)) {
    return null;
  }

  const fix = resolveProcedureFix(dataset, triggerFixId);

  if (!fix) {
    return null;
  }

  const distanceNm = distanceNmBetweenPoints(
    aircraft.latitude,
    aircraft.longitude,
    fix.latitude,
    fix.longitude
  );
  const triggerDistanceNm = profile.trigger_distance_nm ?? deterministicEntryContactDistanceNm(aircraft.callsign);

  if (distanceNm > triggerDistanceNm) {
    return null;
  }

  const text = appFirstContactText(aircraft, triggerFixId);

  return {
    aircraft: markFirstContactCalled(aircraft, profile, currentTimeMs, text),
    event: {
      aircraftId: aircraft.id,
      callsign: sanitizeCallsign(aircraft.callsign),
      role: "APP",
      text,
      detail: `APP first contact at ${triggerFixId}, ${distanceNm.toFixed(1)}NM <= ${triggerDistanceNm.toFixed(1)}NM`
    }
  };
}

function evaluateDepFirstContact(
  aircraft: AircraftState,
  profile: PilotFirstContactState,
  currentTimeMs: number
): PilotFirstContactEvaluation | null {
  if (aircraft.flight_phase !== "departure" || aircraft.departure_roll?.active) {
    return null;
  }

  const triggerAltitudeFt = profile.trigger_altitude_ft ?? DEP_FIRST_CONTACT_TRIGGER_ALTITUDE_FT;

  if (aircraft.altitude_ft < triggerAltitudeFt) {
    return null;
  }

  const text = depFirstContactText(aircraft, triggerAltitudeFt);

  return {
    aircraft: markFirstContactCalled(aircraft, profile, currentTimeMs, text),
    event: {
      aircraftId: aircraft.id,
      callsign: sanitizeCallsign(aircraft.callsign),
      role: "DEP",
      text,
      detail: `DEP first contact passing ${triggerAltitudeFt}ft`
    }
  };
}

function evaluateMissedApproachFirstContact(
  aircraft: AircraftState,
  profile: PilotFirstContactState,
  currentTimeMs: number
): PilotFirstContactEvaluation | null {
  if (aircraft.flight_phase !== "arrival" || aircraft.approach_phase !== "missed") {
    return null;
  }

  const triggerAltitudeFt =
    profile.trigger_altitude_ft ?? MISSED_APP_FIRST_CONTACT_TRIGGER_ALTITUDE_FT;

  if (aircraft.altitude_ft < triggerAltitudeFt) {
    return null;
  }

  const text = missedApproachFirstContactText(aircraft, triggerAltitudeFt);

  return {
    aircraft: markFirstContactCalled(aircraft, profile, currentTimeMs, text),
    event: {
      aircraftId: aircraft.id,
      callsign: sanitizeCallsign(aircraft.callsign),
      role: "MISSED_APP",
      text,
      detail: `MISSED APP first contact passing ${triggerAltitudeFt}ft`
    }
  };
}

function repeatedFirstContactEventForAircraft(
  aircraft: AircraftState,
  dataset: RadarDataset,
  profile: PilotFirstContactState
): PilotFirstContactEvent | null {
  if (profile.role === "APP") {
    const triggerFixId = normalizeFixId(profile.trigger_fix ?? aircraft.planned_entry_fix ?? "");

    if (!isAppFirstContactEntryFix(triggerFixId) || !resolveProcedureFix(dataset, triggerFixId)) {
      return null;
    }

    return {
      aircraftId: aircraft.id,
      callsign: sanitizeCallsign(aircraft.callsign),
      role: "APP",
      text: appFirstContactText(aircraft, triggerFixId),
      detail: `APP first contact repeated after blocked transmission at ${triggerFixId}`
    };
  }

  if (profile.role === "MISSED_APP") {
    const triggerAltitudeFt =
      profile.trigger_altitude_ft ?? MISSED_APP_FIRST_CONTACT_TRIGGER_ALTITUDE_FT;

    return {
      aircraftId: aircraft.id,
      callsign: sanitizeCallsign(aircraft.callsign),
      role: "MISSED_APP",
      text: missedApproachFirstContactText(aircraft, triggerAltitudeFt),
      detail: "MISSED APP first contact repeated after blocked transmission"
    };
  }

  const triggerAltitudeFt = profile.trigger_altitude_ft ?? DEP_FIRST_CONTACT_TRIGGER_ALTITUDE_FT;

  return {
    aircraftId: aircraft.id,
    callsign: sanitizeCallsign(aircraft.callsign),
    role: "DEP",
    text: depFirstContactText(aircraft, triggerAltitudeFt),
    detail: "DEP first contact repeated after blocked transmission"
  };
}

function firstContactProfileForAircraft(aircraft: AircraftState): PilotFirstContactState | null {
  if (aircraft.pilot_first_contact) {
    return aircraft.pilot_first_contact;
  }

  if (
    aircraft.flight_phase === "arrival" &&
    aircraft.approach_phase === "missed" &&
    aircraft.missed_approach_profile_id &&
    !aircraft.missed_approach_reported_at_ms
  ) {
    return missedApproachFirstContactProfile();
  }

  if (
    aircraft.flight_phase === "arrival" &&
    aircraft.owner_position === "APP" &&
    aircraft.planned_entry_fix &&
    isAppFirstContactEntryFix(aircraft.planned_entry_fix)
  ) {
    return arrivalFirstContactProfile(aircraft.planned_entry_fix, aircraft.callsign);
  }

  if (aircraft.flight_phase === "departure" && aircraft.owner_position === "DEP") {
    return departureFirstContactProfile();
  }

  return null;
}

function markFirstContactCalled(
  aircraft: AircraftState,
  profile: PilotFirstContactState,
  currentTimeMs: number,
  callText: string
): AircraftState {
  return {
    ...aircraft,
    missed_approach_reported_at_ms:
      profile.role === "MISSED_APP" ? currentTimeMs : aircraft.missed_approach_reported_at_ms,
    pilot_first_contact: {
      ...profile,
      done: false,
      awaiting_controller_response: true,
      contacted_at_ms: currentTimeMs,
      call_text: callText,
      last_jammed_at_ms: undefined,
      retry_after_ms: undefined
    },
    frequency_state: aircraft.frequency_state === "on_frequency" ? "on_frequency" : "first_contacted"
  };
}

function markFirstContactJammed(
  originalAircraft: AircraftState,
  evaluatedAircraft: AircraftState,
  currentTimeMs: number,
  retryIndex: number
): AircraftState {
  const evaluatedProfile = evaluatedAircraft.pilot_first_contact;

  if (!evaluatedProfile) {
    return originalAircraft;
  }

  const jammedCount =
    (originalAircraft.pilot_first_contact?.jammed_count ?? evaluatedProfile.jammed_count ?? 0) + 1;

  return {
    ...originalAircraft,
    pilot_first_contact: {
      ...evaluatedProfile,
      done: false,
      awaiting_controller_response: false,
      contacted_at_ms: undefined,
      call_text: undefined,
      last_jammed_at_ms: currentTimeMs,
      retry_after_ms:
        currentTimeMs + RADIO_JAMMING_REPEAT_SUPPRESS_MS + retryIndex * RADIO_JAMMING_RETRY_STAGGER_MS,
      jammed_count: jammedCount
    },
    frequency_state: "not_on_frequency"
  };
}

function firstContactAwaitingControllerResponse(aircraft: AircraftState) {
  const profile = aircraft.pilot_first_contact;

  return Boolean(profile && !profile.done && profile.awaiting_controller_response);
}

function mostRecentJammedFirstContactAircraft(aircraftTraffic: AircraftState[]) {
  return aircraftTraffic
    .filter((aircraft) => typeof aircraft.pilot_first_contact?.last_jammed_at_ms === "number")
    .sort((first, second) =>
      (second.pilot_first_contact?.last_jammed_at_ms ?? 0) -
        (first.pilot_first_contact?.last_jammed_at_ms ?? 0) ||
      (second.pilot_first_contact?.jammed_count ?? 0) -
        (first.pilot_first_contact?.jammed_count ?? 0) ||
      sanitizeCallsign(first.callsign).localeCompare(sanitizeCallsign(second.callsign))
    )[0];
}

function newestUnresolvedFirstContactJamTimeMs(aircraftTraffic: AircraftState[]) {
  const jamTimes = aircraftTraffic
    .map((aircraft) =>
      !aircraft.pilot_first_contact?.done &&
      typeof aircraft.pilot_first_contact?.last_jammed_at_ms === "number"
        ? aircraft.pilot_first_contact.last_jammed_at_ms
        : undefined
    )
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return jamTimes.length > 0 ? Math.max(...jamTimes) : undefined;
}

function remainingJammedRetryAfterByAircraftId(
  aircraftTraffic: AircraftState[],
  selectedAircraftId: string,
  currentTimeMs: number
) {
  return new Map(
    aircraftTraffic
      .filter((aircraft) =>
        aircraft.id !== selectedAircraftId &&
        !aircraft.pilot_first_contact?.done &&
        typeof aircraft.pilot_first_contact?.last_jammed_at_ms === "number"
      )
      .sort((first, second) =>
        sanitizeCallsign(first.callsign).localeCompare(sanitizeCallsign(second.callsign))
      )
      .map((aircraft, retryIndex) => [
        aircraft.id,
        currentTimeMs + RADIO_JAMMING_REPEAT_SUPPRESS_MS + retryIndex * RADIO_JAMMING_RETRY_STAGGER_MS
      ])
  );
}

function firstContactRecentlyJammed(profile: PilotFirstContactState, currentTimeMs: number) {
  if (typeof profile.retry_after_ms === "number") {
    return currentTimeMs < profile.retry_after_ms;
  }

  return (
    typeof profile.last_jammed_at_ms === "number" &&
    currentTimeMs - profile.last_jammed_at_ms < RADIO_JAMMING_REPEAT_SUPPRESS_MS
  );
}

function appFirstContactText(aircraft: AircraftState, entryFix: string) {
  const altitudeTargetFt = activeAltitudeTargetFt(aircraft);
  const descending =
    aircraft.vertical_rate_fpm < -100 || altitudeTargetFt < aircraft.altitude_ft - 200;
  const altitudeText = altitudePhraseForAppContact(altitudeTargetFt);
  const altitudeSegment = descending ? `descending ${altitudeText}` : altitudeText;

  return `Jeju Approach, ${callsignTelephonyText(aircraft.callsign)}, approaching ${entryFix}, ${altitudeSegment}.`;
}

function depFirstContactText(aircraft: AircraftState, triggerAltitudeFt: number) {
  const passingAltitudeFt = roundToNearestHundred(Math.max(triggerAltitudeFt, aircraft.altitude_ft));
  const targetAltitudeFt = activeAltitudeTargetFt(aircraft) || 10000;
  const procedureText = departureProcedurePhrase(aircraft);

  return [
    `Jeju Departure, ${callsignTelephonyText(aircraft.callsign)}`,
    `passing ${altitudePhraseForPlainAltitude(passingAltitudeFt)} for ${altitudePhraseForPlainAltitude(targetAltitudeFt)}`,
    procedureText
  ]
    .filter(Boolean)
    .join(", ") + ".";
}

function missedApproachFirstContactText(aircraft: AircraftState, triggerAltitudeFt: number) {
  const passingAltitudeFt = roundToNearestHundred(Math.max(triggerAltitudeFt, aircraft.altitude_ft));
  const targetAltitudeFt = activeAltitudeTargetFt(aircraft);

  return [
    `Jeju Approach, ${callsignTelephonyText(aircraft.callsign)}`,
    "missed approach",
    `passing ${altitudePhraseForPlainAltitude(passingAltitudeFt)} for ${altitudePhraseForPlainAltitude(targetAltitudeFt)}`
  ].join(", ") + ".";
}

function activeAltitudeTargetFt(aircraft: AircraftState) {
  return firstFiniteNumber(
    aircraft.execution_altitude_ft,
    aircraft.assigned?.altitude_ft,
    aircraft.altitude_ft
  );
}

function altitudePhraseForAppContact(altitudeFt: number) {
  const roundedAltitudeFt = roundToNearestHundred(altitudeFt);

  if (roundedAltitudeFt >= 15000) {
    return `flight level ${digitsToTelephonyWords(String(Math.round(roundedAltitudeFt / 100)))}`;
  }

  return altitudePhraseForPlainAltitude(roundedAltitudeFt);
}

function altitudePhraseForPlainAltitude(altitudeFt: number) {
  const roundedAltitudeFt = roundToNearestHundred(altitudeFt);

  if (roundedAltitudeFt >= 1000) {
    const thousands = Math.floor(roundedAltitudeFt / 1000);
    const remainder = roundedAltitudeFt % 1000;
    const thousandsText = `${digitsToTelephonyWords(String(thousands))} thousand`;

    if (remainder === 0) {
      return thousandsText;
    }

    if (remainder % 100 === 0) {
      return `${thousandsText} ${digitsToTelephonyWords(String(remainder / 100))} hundred`;
    }
  }

  if (roundedAltitudeFt >= 100 && roundedAltitudeFt % 100 === 0) {
    return `${digitsToTelephonyWords(String(roundedAltitudeFt / 100))} hundred`;
  }

  return digitsToTelephonyWords(String(roundedAltitudeFt));
}

function departureProcedurePhrase(aircraft: AircraftState) {
  const rawProcedureText = normalizeProcedureText(
    aircraft.procedure_name ?? aircraft.procedure_id ?? aircraft.planned_exit_fix ?? ""
  );

  if (!rawProcedureText) {
    return "departure";
  }

  const sidMatch = rawProcedureText.match(/\b([A-Z]{3,6})\s*(\d+[A-Z])\b/);

  if (sidMatch) {
    return `${sidMatch[1]} ${alphanumericDesignatorToSpeech(sidMatch[2])} departure`;
  }

  const fallbackFix = normalizeFixId(aircraft.planned_exit_fix ?? rawProcedureText);

  return fallbackFix ? `${fallbackFix} departure` : "departure";
}

function alphanumericDesignatorToSpeech(value: string) {
  return value
    .toUpperCase()
    .split("")
    .map((character) =>
      /\d/.test(character) ? digitsToTelephonyWords(character) : phoneticLetter(character)
    )
    .join(" ");
}

function phoneticLetter(letter: string) {
  const map: Record<string, string> = {
    A: "alpha",
    B: "bravo",
    C: "charlie",
    D: "delta",
    E: "echo",
    F: "foxtrot",
    G: "golf",
    H: "hotel",
    I: "india",
    J: "juliett",
    K: "kilo",
    L: "lima",
    M: "mike",
    N: "november",
    O: "oscar",
    P: "papa",
    Q: "quebec",
    R: "romeo",
    S: "sierra",
    T: "tango",
    U: "uniform",
    V: "victor",
    W: "whiskey",
    X: "x-ray",
    Y: "yankee",
    Z: "zulu"
  };

  return map[letter.toUpperCase()] ?? letter.toLowerCase();
}

function normalizeProcedureText(value: string) {
  return value
    .toUpperCase()
    .replace(/_/g, " ")
    .replace(/\bRNAV\b/g, "")
    .replace(/\bSID\b/g, "")
    .replace(/\bDEPARTURE\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deterministicEntryContactDistanceNm(seed: string | number) {
  const seedText = String(seed);
  let hash = 2166136261;

  for (let index = 0; index < seedText.length; index += 1) {
    hash ^= seedText.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const bucket = (hash >>> 0) % 501;

  return Number((5 + bucket / 100).toFixed(1));
}

function resolveProcedureFix(dataset: RadarDataset, fixId: string) {
  const normalizedFixId = normalizeFixId(fixId);

  return dataset.procedures.fixes.find((fix) => normalizeFixId(fix.id) === normalizedFixId) ?? null;
}

function normalizeFixId(fixId: string) {
  return fixId.trim().toUpperCase();
}

function firstFiniteNumber(...values: Array<number | undefined>) {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value)) ?? 0;
}

function roundToNearestHundred(value: number) {
  return Math.round(value / 100) * 100;
}
