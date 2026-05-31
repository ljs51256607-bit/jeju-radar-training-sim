import type { ParsedAtcCommand } from "./atcCommandParser";
import { aircraftWithAltitudeCommand } from "./aircraftCommandTransitions";
import {
  applyProcedureAssignmentDraftToAircraft,
  buildProcedureAssignmentDraft,
  type ProcedureAssignmentDraft
} from "./procedureAssignmentRuntime";
import {
  preferredIlsProcedureIdForRunway,
  procedureRouteFromRecord,
  type ProcedureKind
} from "./procedureRouteUtils";
import {
  pilotResponseForValidation,
  type PilotResponse
} from "./pilotResponseLayer";
import { normalizeFixId } from "./scenarioTraffic";
import type {
  AircraftState,
  AircraftVerticalProcedureMode,
  ProcedureRecord,
  RadarDataset
} from "./types";

export interface EvaluateAtcProcedureCommandArgs {
  parsed: ParsedAtcCommand;
  targetAircraft: AircraftState;
  dataset: RadarDataset;
  commandActiveAtMs: number | undefined;
  issuedAtMs: number;
}

export type AtcProcedureCommandEvaluation =
  | {
      status: "not_supported";
    }
  | {
      status: "response";
      response: PilotResponse;
      controlErrorMessage?: string;
    }
  | {
      status: "applied";
      response: PilotResponse;
      aircraft: AircraftState;
      procedureDraft?: ProcedureAssignmentDraft;
    };

export function evaluateAtcProcedureCommand({
  parsed,
  targetAircraft,
  dataset,
  commandActiveAtMs,
  issuedAtMs
}: EvaluateAtcProcedureCommandArgs): AtcProcedureCommandEvaluation {
  if (parsed.intent === "CLEARED_ILS") {
    return evaluateClearedIlsCommand(parsed, targetAircraft, dataset, issuedAtMs);
  }

  if (parsed.intent === "DESCEND_VIA") {
    return evaluateDescendViaCommand(
      parsed,
      targetAircraft,
      dataset,
      commandActiveAtMs,
      issuedAtMs
    );
  }

  return { status: "not_supported" };
}

function evaluateClearedIlsCommand(
  parsed: ParsedAtcCommand,
  targetAircraft: AircraftState,
  dataset: RadarDataset,
  issuedAtMs: number
): AtcProcedureCommandEvaluation {
  const runway = stringSlot(parsed, "runway")?.slice(0, 2);
  const runwayMode = runway === "25" ? "25" : runway === "07" ? "07" : null;
  const ilsProcedure = runwayMode
    ? dataset.procedures.approaches.find(
        (procedure) => procedure.id === preferredIlsProcedureIdForRunway(runwayMode)
      )
    : null;

  if (!ilsProcedure) {
    return unable(parsed, `ILS runway ${runway ?? "unknown"} not available`);
  }

  return applyProcedureCommand({
    parsed,
    targetAircraft,
    dataset,
    kind: "APP",
    procedure: ilsProcedure,
    issuedAtMs,
    appliedDetail: "ILS procedure applied",
    unableDetail: "aircraft cannot join requested ILS from current state"
  });
}

function evaluateDescendViaCommand(
  parsed: ParsedAtcCommand,
  targetAircraft: AircraftState,
  dataset: RadarDataset,
  commandActiveAtMs: number | undefined,
  issuedAtMs: number
): AtcProcedureCommandEvaluation {
  const star = starForParsedDescendVia(parsed, dataset.procedures.stars);
  const cancelLevel =
    typeof parsed.slots.cancel_level_restriction === "object" &&
    parsed.slots.cancel_level_restriction !== null;
  const altitude = numberSlot(parsed, "altitude_ft");
  let nextAircraft = targetAircraft;
  let procedureDraft: ProcedureAssignmentDraft | undefined;

  if (!star && targetAircraft.procedure_kind !== "STAR") {
    return unable(parsed, "STAR procedure is not active and requested STAR could not be resolved");
  }

  if (star) {
    const applied = applyProcedureCommand({
      parsed,
      targetAircraft,
      dataset,
      kind: "STAR",
      procedure: star,
      verticalProcedureMode: cancelLevel ? "cancel_level" : "des_via",
      issuedAtMs,
      appliedDetail: "descend-via command applied",
      unableDetail: "aircraft cannot join requested STAR from current state"
    });

    if (applied.status !== "applied") {
      return applied;
    }

    nextAircraft = applied.aircraft;
    procedureDraft = applied.procedureDraft;
  } else {
    nextAircraft = {
      ...targetAircraft,
      altitude_control_mode: cancelLevel ? "controller" : "managed",
      vertical_rate_control_mode: cancelLevel ? "controller" : "managed",
      vertical_procedure_mode: cancelLevel ? "cancel_level" : "des_via",
      star_via_clearance_altitude_ft: cancelLevel
        ? undefined
        : targetAircraft.star_via_clearance_altitude_ft,
      execution_altitude_ft: undefined,
      execution_vertical_rate_fpm: undefined,
      managed_altitude_constraint_fix: undefined,
      managed_altitude_constraint_ft: undefined,
      managed_vertical_rate_fpm: undefined,
      pending_descent_altitude_ft: undefined
    };
  }

  if (typeof altitude === "number") {
    nextAircraft = aircraftWithAltitudeCommand(
      {
        ...nextAircraft,
        vertical_procedure_mode: cancelLevel ? "cancel_level" : "des_via"
      },
      altitude,
      commandActiveAtMs
    );
  }

  return {
    status: "applied",
    aircraft: nextAircraft,
    procedureDraft,
    response: accepted(parsed, "descend-via command applied")
  };
}

function applyProcedureCommand({
  parsed,
  targetAircraft,
  dataset,
  kind,
  procedure,
  verticalProcedureMode,
  issuedAtMs,
  appliedDetail,
  unableDetail
}: {
  parsed: ParsedAtcCommand;
  targetAircraft: AircraftState;
  dataset: RadarDataset;
  kind: ProcedureKind;
  procedure: ProcedureRecord;
  verticalProcedureMode?: AircraftVerticalProcedureMode;
  issuedAtMs: number;
  appliedDetail: string;
  unableDetail: string;
}): AtcProcedureCommandEvaluation {
  const draft = buildProcedureAssignmentDraft({
    aircraft: targetAircraft,
    kind,
    procedure,
    dataset,
    verticalProcedureMode,
    issuedAtMs
  });

  if (draft.status === "error") {
    return {
      status: "response",
      controlErrorMessage: draft.message,
      response: pilotResponseForValidation(parsed, {
        status: "unable",
        detail: unableDetail
      })
    };
  }

  return {
    status: "applied",
    procedureDraft: draft,
    aircraft: applyProcedureAssignmentDraftToAircraft(targetAircraft, draft),
    response: accepted(parsed, appliedDetail)
  };
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
    const normalizedProcedureId = normalizeFixId(procedureId).replace(/\s+/g, "_");
    const directMatch = stars.find((procedure) => {
      const id = normalizeFixId(procedure.id);
      const name = normalizeFixId(procedure.name).replace(/\s+/g, "_");

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
      const id = normalizeFixId(procedure.id);
      const name = normalizeFixId(procedure.name);
      const route = procedureRouteFromRecord(procedure, "STAR");
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

function numberSlot(parsed: ParsedAtcCommand, key: string) {
  const value = parsed.slots[key];

  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringSlot(parsed: ParsedAtcCommand, key: string) {
  const value = parsed.slots[key];

  return typeof value === "string" && value ? value : null;
}

function accepted(parsed: ParsedAtcCommand, detail: string) {
  return pilotResponseForValidation(parsed, { status: "accepted", detail });
}

function unable(parsed: ParsedAtcCommand, detail: string): AtcProcedureCommandEvaluation {
  return {
    status: "response",
    response: pilotResponseForValidation(parsed, { status: "unable", detail })
  };
}
