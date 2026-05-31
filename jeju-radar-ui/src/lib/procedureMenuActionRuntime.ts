import { ownerPosition } from "./aircraftInteraction";
import {
  buildCompositeStarIlsProcedure,
  preferredIlsProcedureIdForRunway,
  procedureExitFix,
  procedureRouteFromRecord,
  procedureRouteIncludesFix,
  type ProcedureKind
} from "./procedureRouteUtils";
import { activeRouteTargetFixId } from "./procedureGuidance";
import { normalizeFixId } from "./scenarioTraffic";
import type {
  AircraftState,
  AircraftVerticalProcedureMode,
  ProcedureMenuAction,
  ProcedureRecord,
  ProceduresReference,
  RunwayMode
} from "./types";

type SidExitFixAction = Extract<ProcedureMenuAction, "KAMIT" | "AKPON" | "TAMNA" | "PANSI" | "LIMDI">;
type StarProcedureAction = Extract<ProcedureMenuAction, "STAR_CXL" | "STAR_DES">;

const sidExitFixActions = new Set<ProcedureMenuAction>(["KAMIT", "AKPON", "TAMNA", "PANSI", "LIMDI"]);

export interface EvaluateProcedureMenuActionArgs {
  aircraftId: string;
  action: ProcedureMenuAction;
  aircraftTraffic: AircraftState[];
  procedures: ProceduresReference;
  selectedRunway: RunwayMode;
}

export type ProcedureMenuActionEvaluation =
  | {
      status: "error";
      message: string;
      targetAircraftId?: string;
      openControlPanel: boolean;
    }
  | {
      status: "assign";
      aircraftId: string;
      kind: ProcedureKind;
      procedure: ProcedureRecord;
      verticalProcedureMode?: AircraftVerticalProcedureMode;
    };

export function evaluateProcedureMenuAction({
  aircraftId,
  action,
  aircraftTraffic,
  procedures,
  selectedRunway
}: EvaluateProcedureMenuActionArgs): ProcedureMenuActionEvaluation {
  const aircraft = aircraftTraffic.find((candidate) => candidate.id === aircraftId);

  if (!aircraft) {
    return {
      status: "error",
      message: "항공기를 찾을 수 없음",
      openControlPanel: false
    };
  }

  const directFixId = activeProcedureMenuFixTarget(aircraft);

  if (!directFixId) {
    return {
      status: "error",
      targetAircraftId: aircraftId,
      message: "먼저 절차 진입 FIX로 DCT 지정 또는 절차 수행 필요",
      openControlPanel: true
    };
  }

  const targetOwnerPosition = ownerPosition(aircraft);

  if (isStarProcedureAction(action)) {
    return evaluateStarProcedureMenuAction({
      aircraft,
      aircraftId,
      action,
      stars: procedures.stars,
      directFixId,
      selectedRunway,
      targetOwnerPosition
    });
  }

  if (action === "ILS") {
    return evaluateIlsProcedureMenuAction({
      aircraft,
      aircraftId,
      approaches: procedures.approaches,
      stars: procedures.stars,
      directFixId,
      selectedRunway,
      targetOwnerPosition
    });
  }

  if (isSidExitFixAction(action)) {
    return evaluateSidProcedureMenuAction({
      aircraft,
      aircraftId,
      action,
      sids: procedures.sids,
      selectedRunway,
      targetOwnerPosition
    });
  }

  return {
    status: "error",
    targetAircraftId: aircraftId,
    message: "지원하지 않는 절차 메뉴 동작",
    openControlPanel: true
  };
}

function evaluateStarProcedureMenuAction({
  aircraft,
  aircraftId,
  action,
  stars,
  directFixId,
  selectedRunway,
  targetOwnerPosition
}: {
  aircraft: AircraftState;
  aircraftId: string;
  action: StarProcedureAction;
  stars: ProcedureRecord[];
  directFixId: string;
  selectedRunway: RunwayMode;
  targetOwnerPosition: "APP" | "DEP";
}): ProcedureMenuActionEvaluation {
  if (targetOwnerPosition !== "APP" || (aircraft.arrival_airport ?? "RKPC") !== "RKPC") {
    return error(aircraftId, "STAR는 RKPC 도착 APP 항공기에만 적용");
  }

  const matchingStar = stars.find((procedure) =>
    procedureRouteIncludesFix(procedure, "STAR", directFixId)
  );

  if (!matchingStar) {
    return error(aircraftId, `${directFixId}는 RWY ${selectedRunway} STAR 경로에 없음`);
  }

  return {
    status: "assign",
    aircraftId,
    kind: "STAR",
    procedure: matchingStar,
    verticalProcedureMode: action === "STAR_DES" ? "des_via" : "cancel_level"
  };
}

function evaluateIlsProcedureMenuAction({
  aircraft,
  aircraftId,
  approaches,
  stars,
  directFixId,
  selectedRunway,
  targetOwnerPosition
}: {
  aircraft: AircraftState;
  aircraftId: string;
  approaches: ProcedureRecord[];
  stars: ProcedureRecord[];
  directFixId: string;
  selectedRunway: RunwayMode;
  targetOwnerPosition: "APP" | "DEP";
}): ProcedureMenuActionEvaluation {
  if (targetOwnerPosition !== "APP" || (aircraft.arrival_airport ?? "RKPC") !== "RKPC") {
    return error(aircraftId, "ILS는 RKPC 도착 APP 항공기에만 적용");
  }

  const preferredIlsProcedureId = preferredIlsProcedureIdForRunway(selectedRunway);
  const ilsProcedure =
    approaches.find((procedure) => procedure.id === preferredIlsProcedureId) ??
    approaches.find((procedure) => normalizeFixId(procedure.approach_type ?? "").includes("ILS"));

  if (!ilsProcedure) {
    return error(aircraftId, `RWY ${selectedRunway} ILS 절차를 찾을 수 없음`);
  }

  const ilsRoute = procedureRouteFromRecord(ilsProcedure, "APP");
  const ilsEntryFixId = ilsRoute[0];

  if (procedureRouteIncludesFix(ilsProcedure, "APP", directFixId)) {
    return {
      status: "assign",
      aircraftId,
      kind: "APP",
      procedure: ilsProcedure
    };
  }

  const matchingStarToIls = stars.find((procedure) => {
    const route = procedureRouteFromRecord(procedure, "STAR");
    const directFixIndex = routeIndexOfFix(route, directFixId);
    const ilsEntryFixIndex = ilsEntryFixId ? routeIndexOfFix(route, ilsEntryFixId) : -1;

    return directFixIndex >= 0 && ilsEntryFixIndex >= directFixIndex;
  });

  if (!matchingStarToIls) {
    return error(
      aircraftId,
      `${directFixId}는 RWY ${selectedRunway} ILS 또는 STAR-${ilsEntryFixId ?? "IAF"} 경로에 없음`
    );
  }

  return {
    status: "assign",
    aircraftId,
    kind: "APP",
    procedure: buildCompositeStarIlsProcedure(matchingStarToIls, ilsProcedure)
  };
}

function evaluateSidProcedureMenuAction({
  aircraft,
  aircraftId,
  action,
  sids,
  selectedRunway,
  targetOwnerPosition
}: {
  aircraft: AircraftState;
  aircraftId: string;
  action: SidExitFixAction;
  sids: ProcedureRecord[];
  selectedRunway: RunwayMode;
  targetOwnerPosition: "APP" | "DEP";
}): ProcedureMenuActionEvaluation {
  if (targetOwnerPosition !== "DEP") {
    return error(aircraftId, "SID는 DEP 항공기에만 적용");
  }

  const sidMatchesAction = (procedure: ProcedureRecord) => procedureExitFix(procedure, "SID") === action;
  const matchingSid =
    sids.find((procedure) => sidMatchesAction(procedure) && procedure.runway === aircraft.target_runway) ??
    sids.find((procedure) => sidMatchesAction(procedure) && procedure.runway === selectedRunway) ??
    sids.find(sidMatchesAction);

  if (!matchingSid) {
    return error(aircraftId, `${action} SID를 찾을 수 없음`);
  }

  return {
    status: "assign",
    aircraftId,
    kind: "SID",
    procedure: matchingSid
  };
}

function isSidExitFixAction(action: ProcedureMenuAction): action is SidExitFixAction {
  return sidExitFixActions.has(action);
}

function isStarProcedureAction(action: ProcedureMenuAction): action is StarProcedureAction {
  return action === "STAR_CXL" || action === "STAR_DES";
}

function activeProcedureMenuFixTarget(aircraft: AircraftState) {
  const activeFixId = activeRouteTargetFixId(aircraft) ?? aircraft.planned_entry_fix;

  return activeFixId ? normalizeFixId(activeFixId) : undefined;
}

function routeIndexOfFix(route: string[], fixId: string) {
  const normalizedFixId = normalizeFixId(fixId);

  return route.findIndex((routeFixId) => normalizeFixId(routeFixId) === normalizedFixId);
}

function error(
  targetAircraftId: string,
  message: string
): ProcedureMenuActionEvaluation {
  return {
    status: "error",
    targetAircraftId,
    message,
    openControlPanel: true
  };
}
