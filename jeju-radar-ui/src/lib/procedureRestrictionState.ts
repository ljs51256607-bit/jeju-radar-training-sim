import type { AircraftState } from "./types";

export function normalizeProcedureFixId(fixId: string) {
  return fixId.trim().toUpperCase();
}

export function approachLevelRestrictionCanceled(aircraft: AircraftState, fixId: string) {
  const normalizedFixId = normalizeProcedureFixId(fixId);

  return (aircraft.cancelled_approach_level_restriction_fixes ?? [])
    .map(normalizeProcedureFixId)
    .includes(normalizedFixId);
}

export function addCancelledApproachLevelRestrictionFix(
  aircraft: AircraftState,
  fixId: string
): AircraftState {
  const normalizedFixId = normalizeProcedureFixId(fixId);
  const existingFixes = (aircraft.cancelled_approach_level_restriction_fixes ?? [])
    .map(normalizeProcedureFixId)
    .filter((candidateFixId, index, allFixes) => allFixes.indexOf(candidateFixId) === index);

  return {
    ...aircraft,
    cancelled_approach_level_restriction_fixes: existingFixes.includes(normalizedFixId)
      ? existingFixes
      : [...existingFixes, normalizedFixId]
  };
}

export function speedRestrictionCanceled(aircraft: AircraftState, fixId: string) {
  const normalizedFixId = normalizeProcedureFixId(fixId);

  return (aircraft.cancelled_speed_restriction_fixes ?? [])
    .map(normalizeProcedureFixId)
    .includes(normalizedFixId);
}

export function addCancelledSpeedRestrictionFix(
  aircraft: AircraftState,
  fixId: string
): AircraftState {
  const normalizedFixId = normalizeProcedureFixId(fixId);
  const existingFixes = (aircraft.cancelled_speed_restriction_fixes ?? [])
    .map(normalizeProcedureFixId)
    .filter((candidateFixId, index, allFixes) => allFixes.indexOf(candidateFixId) === index);

  return {
    ...aircraft,
    cancelled_speed_restriction_fixes: existingFixes.includes(normalizedFixId)
      ? existingFixes
      : [...existingFixes, normalizedFixId]
  };
}
