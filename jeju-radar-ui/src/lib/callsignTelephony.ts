import airlineTelephonyCallsignData from "../data/airlineTelephonyCallsigns.json";

export interface AirlineTelephonyCallsign {
  icao: string;
  airline: string;
  telephony: string;
  aliases: string[];
}

export const airlineTelephonyCallsigns = airlineTelephonyCallsignData as AirlineTelephonyCallsign[];

export function sanitizeCallsign(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function telephonyForIcao(icao: string) {
  return airlineTelephonyCallsigns.find((entry) => entry.icao === icao.toUpperCase())?.telephony ?? null;
}

export function telephonyAliasesForIcao(icao: string) {
  const entry = airlineTelephonyCallsigns.find((candidate) => candidate.icao === icao.toUpperCase());

  if (!entry) {
    return [];
  }

  return uniqueStrings([entry.telephony.toUpperCase(), ...entry.aliases.map((alias) => alias.toUpperCase())]);
}

export function callsignTelephonyText(callsign: string) {
  const normalizedCallsign = sanitizeCallsign(callsign);
  const match = normalizedCallsign.match(/^([A-Z]{2,3})(\d{2,4})$/);

  if (!match) {
    return normalizedCallsign;
  }

  const [, icao, digits] = match;
  const telephony = telephonyForIcao(icao);

  return telephony ? `${telephony} ${digitsToTelephonyWords(digits)}` : normalizedCallsign;
}

export function digitsToTelephonyWords(value: string) {
  const map: Record<string, string> = {
    "0": "zero",
    "1": "one",
    "2": "two",
    "3": "three",
    "4": "four",
    "5": "five",
    "6": "six",
    "7": "seven",
    "8": "eight",
    "9": "niner"
  };

  return value
    .split("")
    .map((digit) => map[digit] ?? digit)
    .join(" ");
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
