import { normalizeFixId } from "./scenarioTraffic";
import type {
  AircraftVerticalProcedureMode,
  ProcedureRecord,
  RunwayMode
} from "./types";

export const RKPC_ILS_RWY07_PROCEDURE_ID = "ILS_Z_LOC_Z_RWY_07";
export const RKPC_ILS_RWY25_PROCEDURE_ID = "ILS_Z_LOC_Z_RWY_25";

export type ProcedureKind = "STAR" | "SID" | "APP";

export function parseProcedureRouteText(routeText?: string) {
  if (!routeText) {
    return [];
  }

  return routeText
    .split("-")
    .map((routePart) => normalizeFixId(routePart))
    .filter((routePart) => routePart && !/^\d/.test(routePart) && !/\bFT\b/.test(routePart));
}

export function procedureRouteFromRecord(procedure: ProcedureRecord, kind: ProcedureKind) {
  if (kind === "APP" && procedure.id === RKPC_ILS_RWY07_PROCEDURE_ID) {
    return ["YUMIN", "LIMSO", "RW070"];
  }

  if (kind === "APP" && procedure.id === RKPC_ILS_RWY25_PROCEDURE_ID) {
    return ["DUKAL", "TOKIN", "RW250"];
  }

  const routeFromText = parseProcedureRouteText(procedure.route_text);

  if (routeFromText.length > 0) {
    return routeFromText;
  }

  return [...(procedure.initial_fixes ?? []), ...(procedure.final_fixes ?? [])].map(normalizeFixId);
}

export function preferredIlsProcedureIdForRunway(runwayMode: RunwayMode) {
  return runwayMode === "25" ? RKPC_ILS_RWY25_PROCEDURE_ID : RKPC_ILS_RWY07_PROCEDURE_ID;
}

export function procedureVisibleForRunwayMode(procedure: ProcedureRecord, runwayMode: RunwayMode) {
  if (procedure.runway === runwayMode) {
    return true;
  }

  return runwayMode === "25" && (procedure.runway === "31" || procedure.paired_runway_mode === "25+31");
}

export function procedureScratchpadToken(
  kind: ProcedureKind,
  procedure: ProcedureRecord,
  verticalProcedureMode?: AircraftVerticalProcedureMode
) {
  if (kind === "APP") {
    return normalizeFixId(procedure.approach_type ?? procedure.name).includes("ILS") ? "ILS" : "APP";
  }

  if (kind === "STAR") {
    const runwayToken = procedure.runway === "25" ? "M" : "P";
    return verticalProcedureMode === "des_via" ? `${runwayToken} VIA` : runwayToken;
  }

  return kind;
}

export function procedureRouteIncludesFix(procedure: ProcedureRecord, kind: ProcedureKind, fixId: string) {
  const normalizedFixId = normalizeFixId(fixId);

  return procedureRouteFromRecord(procedure, kind).some(
    (routeFixId) => normalizeFixId(routeFixId) === normalizedFixId
  );
}

export function appendRouteWithoutDuplicate(baseRoute: string[], nextRoute: string[]) {
  const combinedRoute = [...baseRoute];

  for (const fixId of nextRoute) {
    const previousFixId = combinedRoute[combinedRoute.length - 1];

    if (!previousFixId || normalizeFixId(previousFixId) !== normalizeFixId(fixId)) {
      combinedRoute.push(fixId);
    }
  }

  return combinedRoute;
}

export function buildCompositeStarIlsProcedure(star: ProcedureRecord, ils: ProcedureRecord): ProcedureRecord {
  const starRoute = procedureRouteFromRecord(star, "STAR");
  const ilsRoute = procedureRouteFromRecord(ils, "APP");
  const combinedRoute = appendRouteWithoutDuplicate(starRoute, ilsRoute);

  return {
    id: `${star.id}_${ils.id}`,
    name: `${star.name} + ${ils.name}`,
    runway: star.runway,
    route_text: combinedRoute.join(" - "),
    approach_type: "ILS/LOC",
    extraction_status: "composite"
  };
}

export function procedureExitFix(procedure: ProcedureRecord, kind: ProcedureKind) {
  const route = procedureRouteFromRecord(procedure, kind);

  return route.length > 0 ? normalizeFixId(route[route.length - 1]) : undefined;
}

export function matchingStarForEntryFix(stars: ProcedureRecord[], entryFix: string) {
  const normalizedEntryFix = normalizeFixId(entryFix);

  return stars.find((procedure) => {
    const route = procedureRouteFromRecord(procedure, "STAR");

    return route.length > 0 && normalizeFixId(route[0]) === normalizedEntryFix;
  });
}

export function matchingStarIncludingFix(stars: ProcedureRecord[], fixId: string) {
  return stars.find((procedure) => procedureRouteIncludesFix(procedure, "STAR", fixId));
}

export function matchingSidForExitFix(sids: ProcedureRecord[], exitFix: string) {
  const normalizedExitFix = normalizeFixId(exitFix);

  return sids.find((procedure) => procedureExitFix(procedure, "SID") === normalizedExitFix);
}
