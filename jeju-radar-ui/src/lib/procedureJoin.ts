import { distanceNmBetweenPoints } from "./aircraftMotion";
import { activeRouteTargetFixId, resolveDirectFix } from "./procedureGuidance";
import type { ProcedureKind } from "./procedureRouteUtils";
import { normalizeFixId } from "./scenarioTraffic";
import type { AircraftState, RadarDataset } from "./types";

const DEFAULT_PROCEDURE_START_FIX_REACHED_THRESHOLD_NM = 0.25;

export type ProcedureStartIndexResult =
  | {
      routeIndex: number;
    }
  | {
      error: string;
    };

export function procedureStartIndexForAircraft(
  aircraft: AircraftState,
  route: string[],
  dataset: RadarDataset,
  kind: ProcedureKind,
  reachedThresholdNm = DEFAULT_PROCEDURE_START_FIX_REACHED_THRESHOLD_NM
): ProcedureStartIndexResult {
  const directFixId = activeRouteTargetFixId(aircraft) ?? aircraft.planned_entry_fix;

  if (!directFixId) {
    return { routeIndex: 0 };
  }

  const normalizedDirectFixId = normalizeFixId(directFixId);
  const routeIndex = route.findIndex((fixId) => normalizeFixId(fixId) === normalizedDirectFixId);

  if (routeIndex < 0) {
    return { error: `${normalizedDirectFixId}는 선택한 ${kind} 경로에 없음` };
  }

  const directFix = resolveDirectFix(dataset, normalizedDirectFixId);

  if (!directFix) {
    return { error: `${normalizedDirectFixId} 좌표 없음` };
  }

  const distanceToDirectFixNm = distanceNmBetweenPoints(
    aircraft.latitude,
    aircraft.longitude,
    directFix.latitude,
    directFix.longitude
  );

  if (kind !== "APP" && distanceToDirectFixNm <= reachedThresholdNm && routeIndex + 1 < route.length) {
    return { routeIndex: routeIndex + 1 };
  }

  return { routeIndex };
}
