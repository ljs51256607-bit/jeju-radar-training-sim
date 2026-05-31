import { initialBearingTrueDeg } from "./aircraftMotion";
import {
  formatHeading,
  trueToMagneticHeading,
  type AircraftControlForm
} from "./aircraftControlPanel";
import {
  activeProcedureScratchpadToken,
  defaultVerticalProcedureModeForKind,
  mergeProcedureScratchpad
} from "./aircraftInteraction";
import { aircraftWithProcedureCommand } from "./procedureApplication";
import { resolveDirectFix } from "./procedureGuidance";
import { procedureStartIndexForAircraft } from "./procedureJoin";
import {
  procedureRouteFromRecord,
  procedureScratchpadToken,
  type ProcedureKind
} from "./procedureRouteUtils";
import { commandActivationTimeMs } from "./simulationTickRuntime";
import type {
  AircraftCommandKind,
  AircraftState,
  AircraftVerticalProcedureMode,
  ProcedureRecord,
  ProceduresReference,
  RadarDataset
} from "./types";

type ProcedureFix = ProceduresReference["fixes"][number];

export interface BuildProcedureAssignmentDraftArgs {
  aircraft: AircraftState;
  kind: ProcedureKind;
  procedure: ProcedureRecord;
  dataset: RadarDataset;
  verticalProcedureMode?: AircraftVerticalProcedureMode;
  issuedAtMs: number;
}

export interface ProcedureAssignmentDraft {
  status: "created";
  kind: ProcedureKind;
  procedure: ProcedureRecord;
  route: string[];
  procedureRouteIndex: number;
  firstFix: ProcedureFix;
  verticalProcedureMode: AircraftVerticalProcedureMode;
  procedureToken: string;
  guidanceActiveAtMs: number | undefined;
}

export type ProcedureAssignmentDraftResult =
  | ProcedureAssignmentDraft
  | { status: "error"; message: string };

export function procedureCommandKind(
  kind: ProcedureKind,
  procedure: ProcedureRecord
): AircraftCommandKind {
  if (kind === "STAR") {
    return "STAR";
  }

  if (kind === "SID") {
    return "SID";
  }

  return "ILS";
}

export function buildProcedureAssignmentDraft({
  aircraft,
  kind,
  procedure,
  dataset,
  verticalProcedureMode,
  issuedAtMs
}: BuildProcedureAssignmentDraftArgs): ProcedureAssignmentDraftResult {
  const route = procedureRouteFromRecord(procedure, kind);
  const missingFixId = route.find((fixId) => !resolveDirectFix(dataset, fixId));
  const startIndexResult = procedureStartIndexForAircraft(
    aircraft,
    route,
    dataset,
    kind
  );

  if ("error" in startIndexResult) {
    return { status: "error", message: startIndexResult.error };
  }

  const procedureRouteIndex = startIndexResult.routeIndex;
  const firstFixId = route[procedureRouteIndex];
  const firstFix = firstFixId ? resolveDirectFix(dataset, firstFixId) : null;

  if (!firstFix || missingFixId) {
    return { status: "error", message: `${missingFixId ?? firstFixId ?? "ROUTE"} 좌표 없음` };
  }

  const resolvedVerticalProcedureMode =
    verticalProcedureMode ?? defaultVerticalProcedureModeForKind(kind);

  return {
    status: "created",
    kind,
    procedure,
    route,
    procedureRouteIndex,
    firstFix,
    verticalProcedureMode: resolvedVerticalProcedureMode,
    procedureToken: procedureScratchpadToken(kind, procedure, resolvedVerticalProcedureMode),
    guidanceActiveAtMs: commandActivationTimeMs(
      dataset,
      procedureCommandKind(kind, procedure),
      issuedAtMs
    )
  };
}

export function applyProcedureAssignmentDraftToAircraft(
  aircraft: AircraftState,
  draft: ProcedureAssignmentDraft
): AircraftState {
  return aircraftWithProcedureCommand({
    aircraft,
    kind: draft.kind,
    procedure: draft.procedure,
    route: draft.route,
    procedureRouteIndex: draft.procedureRouteIndex,
    firstFix: draft.firstFix,
    verticalProcedureMode: draft.verticalProcedureMode,
    guidanceActiveAtMs: draft.guidanceActiveAtMs
  });
}

export function procedureAssignmentControlFormAfterDraft(
  currentForm: AircraftControlForm,
  aircraft: AircraftState,
  draft: ProcedureAssignmentDraft,
  magneticVariationWestDeg: number
): AircraftControlForm {
  const headingTrue = initialBearingTrueDeg(
    aircraft.latitude,
    aircraft.longitude,
    draft.firstFix.latitude,
    draft.firstFix.longitude
  );
  const headingMag = trueToMagneticHeading(headingTrue, magneticVariationWestDeg);
  const previousProcedureToken = activeProcedureScratchpadToken(aircraft);
  const scratchpadBase = aircraft.scratchpad ?? currentForm.scratchpad;

  return {
    ...currentForm,
    heading: formatHeading(headingMag),
    scratchpad: mergeProcedureScratchpad(scratchpadBase, previousProcedureToken, draft.procedureToken)
  };
}
