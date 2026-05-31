import {
  activeDirectScratchpadToken,
  activeProcedureScratchpadToken,
  scratchpadContainsToken
} from "./aircraftInteraction";
import { normalizeScratchpadText } from "./scenarioTraffic";
import type { AircraftState } from "./types";

export function aircraftWithScratchpadText(
  aircraft: AircraftState,
  value: string
): AircraftState {
  const scratchpad = normalizeScratchpadText(value);
  const directToken = activeDirectScratchpadToken(aircraft);
  const procedureToken = activeProcedureScratchpadToken(aircraft);

  return {
    ...aircraft,
    scratchpad,
    scratchpad_auto_direct_token:
      directToken && scratchpadContainsToken(scratchpad, directToken) ? directToken : undefined,
    scratchpad_auto_procedure_token:
      procedureToken && scratchpadContainsToken(scratchpad, procedureToken) ? procedureToken : undefined
  };
}

export function aircraftWithClearedScratchpadText(aircraft: AircraftState): AircraftState {
  return {
    ...aircraft,
    scratchpad: "",
    scratchpad_auto_direct_token: undefined,
    scratchpad_auto_procedure_token: undefined
  };
}

export function scratchpadTextControlValue(value: string) {
  return normalizeScratchpadText(value);
}
