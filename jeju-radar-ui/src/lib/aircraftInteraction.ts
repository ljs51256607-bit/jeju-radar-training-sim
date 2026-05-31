import {
  directScratchpad,
  normalizeScratchpadText
} from "./scenarioTraffic";
import type { ProcedureKind } from "./procedureRouteUtils";
import type {
  AircraftState,
  AircraftVerticalProcedureMode
} from "./types";

export function ownerPosition(target: AircraftState) {
  if (target.owner_position) {
    return target.owner_position;
  }

  return target.flight_phase === "departure" ? "DEP" : "APP";
}

function scratchpadTokens(value: string) {
  return normalizeScratchpadText(value)
    .split(" ")
    .filter(Boolean);
}

export function scratchpadContainsToken(value: string, token: string) {
  const tokenParts = scratchpadTokens(token);

  if (tokenParts.length === 0) {
    return false;
  }

  const valueParts = scratchpadTokens(value);

  return valueParts.some((_, startIndex) =>
    tokenParts.every((tokenPart, tokenIndex) => valueParts[startIndex + tokenIndex] === tokenPart)
  );
}

export function removeScratchpadToken(value: string, token: string) {
  const tokenParts = scratchpadTokens(token);

  if (tokenParts.length === 0) {
    return normalizeScratchpadText(value);
  }

  const valueParts = scratchpadTokens(value);
  const nextParts: string[] = [];

  for (let index = 0; index < valueParts.length; index += 1) {
    const matchesToken = tokenParts.every(
      (tokenPart, tokenIndex) => valueParts[index + tokenIndex] === tokenPart
    );

    if (matchesToken) {
      index += tokenParts.length - 1;
      continue;
    }

    nextParts.push(valueParts[index]);
  }

  return nextParts.join(" ");
}

export function removeScratchpadTokens(value: string, tokens: string[]) {
  return tokens.reduce((scratchpad, token) => removeScratchpadToken(scratchpad, token), value);
}

export type AtcControlScratchpadTokenKind = "heading" | "speed";

export function headingScratchpadToken(headingMagDeg: number) {
  const roundedHeading = Math.round(headingMagDeg);
  const normalizedHeading = roundedHeading === 360 ? 360 : normalizeHeading(roundedHeading);

  return `H${String(Math.round(normalizedHeading / 10)).padStart(2, "0")}`;
}

export function speedScratchpadToken(speedKt: number) {
  return `S${String(Math.round(speedKt / 10)).padStart(2, "0")}`;
}

export function mergeAtcControlScratchpadToken(
  value: string,
  kind: AtcControlScratchpadTokenKind,
  token: string
) {
  const cleanedValue = removeAtcControlScratchpadTokens(value, [kind]);
  const mergedValue = scratchpadContainsToken(cleanedValue, token)
    ? cleanedValue
    : [cleanedValue, token].filter(Boolean).join(" ");

  return orderAtcControlScratchpadTokens(mergedValue);
}

function orderAtcControlScratchpadTokens(value: string) {
  const tokens = scratchpadTokens(value);
  const headingToken = tokens.find((candidate) => /^H\d{2}$/.test(candidate));
  const speedToken = tokens.find((candidate) => /^S\d{2}$/.test(candidate));
  const remainingTokens = tokens.filter((candidate) => !/^H\d{2}$/.test(candidate) && !/^S\d{2}$/.test(candidate));

  return [headingToken, speedToken, ...remainingTokens].filter(Boolean).join(" ");
}

export function removeAtcControlScratchpadTokens(
  value: string,
  kinds: AtcControlScratchpadTokenKind[]
) {
  const kindSet = new Set(kinds);

  return scratchpadTokens(value)
    .filter((token) => {
      if (kindSet.has("heading") && /^H\d{2}$/.test(token)) {
        return false;
      }

      if (kindSet.has("speed") && /^S\d{2}$/.test(token)) {
        return false;
      }

      return true;
    })
    .join(" ");
}

export function mergeDirectScratchpad(
  value: string,
  previousDirectToken: string | undefined,
  nextDirectToken: string
) {
  const cleanedValue = previousDirectToken
    ? removeScratchpadToken(value, previousDirectToken)
    : normalizeScratchpadText(value);

  if (!nextDirectToken) {
    return cleanedValue;
  }

  if (scratchpadContainsToken(cleanedValue, nextDirectToken)) {
    return cleanedValue;
  }

  return [cleanedValue, nextDirectToken].filter(Boolean).join(" ");
}

export function mergeProcedureScratchpad(
  value: string,
  previousProcedureToken: string | undefined,
  nextProcedureToken: string
) {
  return mergeDirectScratchpad(value, previousProcedureToken, nextProcedureToken);
}

export function activeDirectScratchpadToken(aircraft: AircraftState) {
  if (aircraft.route_mode === "procedure" && aircraft.scratchpad_auto_direct_token) {
    return aircraft.scratchpad_auto_direct_token;
  }

  if (aircraft.route_mode !== "direct" || !aircraft.next_fix) {
    return undefined;
  }

  return aircraft.scratchpad_auto_direct_token ?? directScratchpad(aircraft.next_fix);
}

export function activeProcedureScratchpadToken(aircraft: AircraftState) {
  if (aircraft.route_mode !== "procedure" || !aircraft.procedure_route?.length) {
    return undefined;
  }

  return aircraft.scratchpad_auto_procedure_token ?? aircraft.procedure_kind;
}

export function activeGuidanceScratchpadTokens(aircraft: AircraftState) {
  return [activeDirectScratchpadToken(aircraft), activeProcedureScratchpadToken(aircraft)].filter(
    Boolean
  ) as string[];
}

export function defaultVerticalProcedureModeForKind(
  kind: ProcedureKind
): AircraftVerticalProcedureMode {
  if (kind === "APP") {
    return "approach";
  }

  if (kind === "STAR") {
    return "cancel_level";
  }

  return "controller";
}

export function procedureSelectionUsesManagedAltitude(
  kind: ProcedureKind,
  mode: AircraftVerticalProcedureMode
) {
  if (kind === "APP") {
    return mode === "approach";
  }

  return false;
}

function formatVerticalProcedureMode(mode: AircraftVerticalProcedureMode | undefined) {
  if (mode === "des_via") {
    return "DES VIA";
  }

  if (mode === "approach") {
    return "APP PROF";
  }

  if (mode === "cancel_level") {
    return "CXL LVL";
  }

  return "CTL";
}

export function formatAircraftVerticalProcedureMode(aircraft: AircraftState) {
  if (aircraft.energy_mode === "expedite_descent") {
    return "EXP DES";
  }

  return formatVerticalProcedureMode(
    aircraft.vertical_procedure_mode ??
      (aircraft.procedure_kind === "APP"
        ? "approach"
        : aircraft.procedure_kind === "STAR"
          ? "cancel_level"
          : "controller")
  );
}

function normalizeHeading(headingDeg: number) {
  return ((headingDeg % 360) + 360) % 360;
}
