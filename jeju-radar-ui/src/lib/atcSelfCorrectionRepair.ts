import {
  normalizeAtcPhrase,
  parseAtcCommand,
  type ParsedAtcCommand
} from "./atcCommandParser";

export interface AtcSelfCorrectionRepairResult {
  raw: string;
  normalized: string;
  repaired: string;
  changed: boolean;
  detail?: string;
}

const implicitParserCallsign = "JJA000";
const correctionMarker = "CORRECTION";

export function repairControllerSelfCorrection(rawPhrase: string): AtcSelfCorrectionRepairResult {
  const raw = String(rawPhrase ?? "");
  const normalized = normalizeCorrectionMarkers(normalizeAtcPhrase(raw));
  const marker = lastCorrectionMarker(normalized);

  if (!marker) {
    return {
      raw,
      normalized,
      repaired: normalized,
      changed: false
    };
  }

  if (isReadbackCorrectionPhrase(normalized)) {
    return {
      raw,
      normalized,
      repaired: normalized,
      changed: false,
      detail: "readback correction marker preserved"
    };
  }

  const prefix = normalized.slice(0, marker.index).trim();
  const correctionTail = normalized.slice(marker.index + marker.length).trim();

  if (!prefix || !correctionTail) {
    return {
      raw,
      normalized,
      repaired: prefix || normalized,
      changed: Boolean(prefix),
      detail: "empty controller correction tail"
    };
  }

  const correctedCallsignSplit = splitCallsign(correctionTail);
  if (correctedCallsignSplit.callsign && correctedCallsignSplit.body) {
    const correctedSegments = splitCommandSegments(
      correctedCallsignSplit.body,
      correctedCallsignSplit.callsign
    );
    const parsedCorrected = parsedSegment(correctedSegments[0], correctedCallsignSplit.callsign);

    if (correctedSegments.length > 0 && parsedCorrected?.ok) {
      const repaired = normalizeAtcPhrase(
        `${correctedCallsignSplit.callsign} ${correctedSegments.join(" AND ")}`
      );

      return {
        raw,
        normalized,
        repaired,
        changed: repaired !== normalized,
        detail: "controller correction replaced callsign and command"
      };
    }
  }

  const split = splitCallsign(prefix);
  const callsign = split.callsign;
  const prefixBody = split.body;
  const prefixSegments = splitCommandSegments(prefixBody, callsign);

  if (prefixSegments.length === 0) {
    const repairedFallback = normalizeAtcPhrase(`${callsign ? `${callsign} ` : ""}${correctionTail}`);

    return {
      raw,
      normalized,
      repaired: repairedFallback,
      changed: repairedFallback !== normalized,
      detail: "controller correction replaced unparsed prefix"
    };
  }

  const replacement = replacementSegmentsForCorrection(correctionTail, prefixSegments, callsign);

  if (replacement.segments.length === 0) {
    return {
      raw,
      normalized,
      repaired: normalized,
      changed: false,
      detail: "controller correction tail could not be repaired"
    };
  }

  const replaceIndex = replacementIndexForCorrection(prefixSegments, replacement);
  const repairedBodySegments = [
    ...prefixSegments.slice(0, replaceIndex),
    ...replacement.segments,
    ...prefixSegments.slice(replaceIndex + 1)
  ];
  const repaired = normalizeAtcPhrase(
    `${callsign ? `${callsign} ` : ""}${repairedBodySegments.join(" AND ")}`
  );

  return {
    raw,
    normalized,
    repaired,
    changed: repaired !== normalized,
    detail: `controller correction repaired ${prefixSegments[replaceIndex] ?? "command"}`
  };
}

function normalizeCorrectionMarkers(phrase: string) {
  return phrase
    .replace(/\bCORRECTIONS\b/g, correctionMarker)
    .replace(/\bCORRECTING\b/g, correctionMarker)
    .replace(/\bCORRECT\b/g, correctionMarker)
    .replace(/\bCOLLECTION\b/g, correctionMarker)
    .replace(/\bI MEAN\b/g, correctionMarker)
    .replace(/\bACTUALLY\b/g, correctionMarker)
    .replace(/\s+/g, " ")
    .trim();
}

function lastCorrectionMarker(phrase: string) {
  const matches = [...phrase.matchAll(new RegExp(`\\b${correctionMarker}\\b`, "g"))];
  const match = matches[matches.length - 1];

  return match ? { index: match.index ?? 0, length: match[0].length } : null;
}

function isReadbackCorrectionPhrase(phrase: string) {
  return (
    /^NEGATIVE\s+[A-Z]{2,3}\d{2,4}\s+CORRECTION\s+/.test(phrase) ||
    /^[A-Z]{2,3}\d{2,4}\s+NEGATIVE\s+CORRECTION\s+/.test(phrase)
  );
}

function splitCallsign(phrase: string) {
  const match = phrase.match(/^([A-Z]{2,3}\d{2,4})\s+(.+)$/);

  if (!match) {
    return {
      callsign: null,
      body: phrase
    };
  }

  return {
    callsign: match[1],
    body: match[2]
  };
}

function splitCommandSegments(body: string, callsign: string | null): string[] {
  const directSegments = normalizeAtcPhrase(body)
    .split(/\s+(?:AND THEN|THEN|AND)\s+/)
    .flatMap((segment) => splitImplicitCommandSegment(segment, callsign))
    .map((segment) => segment.trim())
    .filter(Boolean);

  return directSegments.length > 0 ? directSegments : [];
}

function splitImplicitCommandSegment(body: string, callsign: string | null): string[] {
  const normalizedBody = normalizeAtcPhrase(body);

  if (!normalizedBody) {
    return [];
  }

  if (commandBodyParses(normalizedBody, callsign)) {
    return [normalizedBody];
  }

  const tokens = normalizedBody.split(/\s+/).filter(Boolean);
  const segments: string[] = [];
  let startIndex = 0;

  while (startIndex < tokens.length) {
    let bestEndIndex = -1;

    for (let endIndex = tokens.length; endIndex > startIndex; endIndex -= 1) {
      const candidate = tokens.slice(startIndex, endIndex).join(" ");

      if (commandBodyParses(candidate, callsign)) {
        bestEndIndex = endIndex;
        break;
      }
    }

    if (bestEndIndex <= startIndex) {
      if (segments.length > 0) {
        segments.push(tokens.slice(startIndex).join(" "));
        return segments;
      }

      return [normalizedBody];
    }

    segments.push(tokens.slice(startIndex, bestEndIndex).join(" "));
    startIndex = bestEndIndex;
  }

  return segments;
}

function commandBodyParses(body: string, callsign: string | null) {
  return parseAtcCommand(`${callsign ?? implicitParserCallsign} ${body}`).ok;
}

function replacementSegmentsForCorrection(
  correctionTail: string,
  prefixSegments: string[],
  callsign: string | null
) {
  const tailSegments = splitCommandSegments(correctionTail, callsign);
  const parsedTail = parsedSegment(tailSegments[0], callsign);

  if (tailSegments.length > 0 && parsedTail?.ok) {
    return {
      segments: tailSegments,
      parsed: parsedTail,
      inferred: false
    };
  }

  const inferredSegment = inferCorrectionSegment(correctionTail, prefixSegments[prefixSegments.length - 1], callsign);
  const parsedInferred = parsedSegment(inferredSegment, callsign);

  return {
    segments: inferredSegment ? [inferredSegment] : [],
    parsed: parsedInferred,
    inferred: true
  };
}

function inferCorrectionSegment(
  correctionTail: string,
  previousSegment: string | undefined,
  callsign: string | null
) {
  if (!previousSegment) {
    return null;
  }

  const parsedPrevious = parsedSegment(previousSegment, callsign);
  const tail = normalizeAtcPhrase(correctionTail);

  if (!parsedPrevious?.intent || !tail) {
    return null;
  }

  if (/^\d{1,5}$/.test(tail)) {
    if (parsedPrevious.intent === "ASSIGN_HEADING" || parsedPrevious.intent === "ONE_CIRCLE_HEADING") {
      return replaceFirstPattern(previousSegment, /\bHEADING\s+\d{1,3}\b/, `HEADING ${tail}`);
    }

    if (
      parsedPrevious.intent === "ASSIGN_SPEED" ||
      parsedPrevious.intent === "SPEED_UNTIL_FIX" ||
      parsedPrevious.intent === "SPEED_UNTIL_FIX_THEN_NORMAL" ||
      parsedPrevious.intent === "MAINTAIN_SPEED_LIMIT"
    ) {
      return replaceLastNumber(previousSegment, tail);
    }

    if (parsedPrevious.intent === "ASSIGN_ALTITUDE") {
      return replaceLastNumber(previousSegment, tail);
    }
  }

  if (
    /^[A-Z0-9]{2,6}$/.test(tail) &&
    (parsedPrevious.intent === "DIRECT_TO_FIX" || parsedPrevious.intent === "TURN_DIRECT_FIX")
  ) {
    return replaceFirstPattern(previousSegment, /\b[A-Z0-9]{2,6}\b$/, tail);
  }

  return null;
}

function replacementIndexForCorrection(
  prefixSegments: string[],
  replacement: {
    parsed: ParsedAtcCommand | null;
    inferred: boolean;
  }
) {
  if (replacement.inferred || !replacement.parsed?.intent) {
    return Math.max(0, prefixSegments.length - 1);
  }

  for (let index = prefixSegments.length - 1; index >= 0; index -= 1) {
    const parsedPrefix = parsedSegment(prefixSegments[index], replacement.parsed.callsign);

    if (
      parsedPrefix?.category === replacement.parsed.category ||
      parsedPrefix?.intent === replacement.parsed.intent
    ) {
      return index;
    }
  }

  return Math.max(0, prefixSegments.length - 1);
}

function parsedSegment(segment: string | null | undefined, callsign: string | null) {
  if (!segment) {
    return null;
  }

  return parseAtcCommand(`${callsign ?? implicitParserCallsign} ${segment}`);
}

function replaceFirstPattern(segment: string, pattern: RegExp, replacement: string) {
  const repaired = normalizeAtcPhrase(segment).replace(pattern, replacement);

  return repaired === segment ? null : repaired;
}

function replaceLastNumber(segment: string, replacement: string) {
  const repaired = normalizeAtcPhrase(segment).replace(/\d{1,5}(?!.*\d)/, replacement);

  return repaired === segment ? null : repaired;
}
