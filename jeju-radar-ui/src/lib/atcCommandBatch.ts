import {
  atcCommandSummary,
  normalizeAtcPhrase,
  parseAtcCommand,
  stripAtcCommandPreambleWithInfo,
  type AtcCommandPreambleInfo,
  type ParsedAtcCommand
} from "./atcCommandParser";
import { repairControllerSelfCorrection } from "./atcSelfCorrectionRepair";

export interface ParsedAtcCommandBatch {
  raw: string;
  normalized: string;
  callsign: string | null;
  commandTexts: string[];
  commands: ParsedAtcCommand[];
  split: boolean;
}

const protectedAndToken = "__ATC_AND__";
const protectedThenToken = "__ATC_THEN__";
const implicitParserCallsign = "JJA000";

export function parseAtcCommandBatch(rawPhrase: string): ParsedAtcCommandBatch {
  const repair = repairControllerSelfCorrection(rawPhrase);
  const normalized = normalizeBatchPhrase(repair.repaired);
  const repairReadbackCorrection = repair.changed && hasNegativeCorrectionMarker(repair.normalized);
  const negativePrefix = stripNegativeCorrectionBeforeCallsign(normalized);
  const split = splitCallsign(negativePrefix.phrase);

  if (!split.callsign || !split.body) {
    const command = parseAtcCommand(repair.repaired);

    return {
      raw: rawPhrase,
      normalized,
      callsign: command.callsign,
      commandTexts: [normalized],
      commands: [command],
      split: false
    };
  }

  const correctionSplit = stripNegativeCorrectionAfterCallsign(split.body);
  const readbackCorrection =
    repairReadbackCorrection ||
    negativePrefix.readbackCorrection ||
    correctionSplit.readbackCorrection;
  const preambleSplit = stripAtcCommandPreambleWithInfo(correctionSplit.body);
  const body = preambleSplit.body;
  const bodySegments = splitCommandBody(body);

  if (bodySegments.length <= 1) {
    const commandText = commandTextForSegment(
      split.callsign,
      body || correctionSplit.body,
      readbackCorrection
    );

    return {
      raw: rawPhrase,
      normalized: commandText,
      callsign: split.callsign,
      commandTexts: [commandText],
      commands: [commandWithBatchPreamble(parseAtcCommand(commandText), preambleSplit.preamble)],
      split: false
    };
  }

  const commandTexts = bodySegments.map((segment) =>
    commandTextForSegment(split.callsign, segment, readbackCorrection)
  );
  const parsedCommands = inheritPublishedHoldFixFromPreviousCommand(
    commandTexts.map((commandText) =>
      commandWithBatchPreamble(parseAtcCommand(commandText), preambleSplit.preamble)
    )
  );

  return {
    raw: rawPhrase,
    normalized,
    callsign: split.callsign,
    commandTexts,
    commands: parsedCommands,
    split: true
  };
}

function commandWithBatchPreamble(command: ParsedAtcCommand, preamble: AtcCommandPreambleInfo) {
  if (!preamble.present) {
    return command;
  }

  const commandPreamble = command.preamble;

  return {
    ...command,
    preamble: {
      present: true,
      unit: commandPreamble?.unit ?? preamble.unit,
      radar_contact: Boolean(commandPreamble?.radar_contact || preamble.radar_contact),
      stripped_tokens: [
        ...new Set([
          ...(commandPreamble?.stripped_tokens ?? []),
          ...preamble.stripped_tokens
        ])
      ]
    }
  };
}

function hasNegativeCorrectionMarker(normalizedPhrase: string) {
  return /\bNEGATIVE\b/.test(normalizedPhrase) && /\bCORRECTION\b/.test(normalizedPhrase);
}

function commandTextForSegment(
  callsign: string,
  segment: string,
  readbackCorrection: boolean
) {
  return normalizeAtcPhrase(`${callsign} ${readbackCorrection ? "negative " : ""}${segment}`);
}

export function pilotReadbackForParsedCommandBatch(commands: ParsedAtcCommand[]) {
  const callsign = commands[0]?.callsign ?? "";

  if (commands.length === 0) {
    return callsign ? `${callsign}, say again.` : "Say again.";
  }

  if (commands.length === 1) {
    const summary = atcCommandSummary(commands[0]);

    return callsign ? `${summary}, ${callsign}` : summary;
  }

  const summaries = commands.map(atcCommandSummary).filter(Boolean);

  return `${summaries.join(", ")}, ${callsign}`;
}

function normalizeBatchPhrase(rawPhrase: string) {
  const phrase = String(rawPhrase ?? "")
    .trim()
    .toUpperCase()
    .replace(/[;:]/g, " AND ")
    .replace(/,/g, " AND ")
    .replace(/[.!?]/g, " ")
    .replace(/\s+/g, " ");

  return normalizeAtcPhrase(phrase);
}

function splitCallsign(normalizedPhrase: string) {
  const match = normalizedPhrase.match(/^([A-Z]{2,3}\d{2,4})\s+(.+)$/);

  if (!match) {
    return {
      callsign: null,
      body: normalizedPhrase
    };
  }

  return {
    callsign: match[1],
    body: match[2].replace(/^AND\s+/, "")
  };
}

function stripNegativeCorrectionBeforeCallsign(phrase: string) {
  const match = phrase.match(/^NEGATIVE\s+([A-Z]{2,3}\d{2,4})\s+(?:CORRECTION\s+)?(.+)$/);

  if (!match) {
    return { phrase, readbackCorrection: false };
  }

  return {
    phrase: `${match[1]} ${match[2]}`.trim(),
    readbackCorrection: true
  };
}

function stripNegativeCorrectionAfterCallsign(body: string) {
  const match = normalizeAtcPhrase(body).match(/^NEGATIVE\s+(?:CORRECTION\s+)?(.+)$/);

  if (!match) {
    return { body, readbackCorrection: false };
  }

  return {
    body: match[1].trim(),
    readbackCorrection: true
  };
}

function splitCommandBody(body: string) {
  const protectedBody = body
    .replace(/\b(CLIMB|DESCEND)\s+AND\s+MAINTAIN\b/g, `$1 ${protectedAndToken} MAINTAIN`)
    .replace(/\bSPEED\s+(\d{2,3})\s+OR\s+(LESS|GREATER)\b/g, "SPEED $1 OR $2")
    .replace(/\bMAINTAIN\s+SPEED\s+(\d{2,3})\s+OR\s+(LESS|GREATER)\b/g, "MAINTAIN SPEED $1 OR $2")
    .replace(/\bUNTIL\s+([A-Z0-9]{2,6})\s+THEN\s+NORMAL\s+SPEED\b/g, `UNTIL $1 ${protectedThenToken} NORMAL SPEED`);

  return protectedBody
    .split(/\s+(?:AND THEN|THEN|AND)\s+/)
    .flatMap(splitImplicitCommandBody)
    .map(restoreProtectedAnd)
    .filter(Boolean);
}

function splitImplicitCommandBody(body: string) {
  if (commandBodyParses(body)) {
    return [body];
  }

  const tokens = body.split(/\s+/).filter(Boolean);
  const segments: string[] = [];
  let startIndex = 0;

  while (startIndex < tokens.length) {
    let bestEndIndex = -1;

    for (let endIndex = tokens.length; endIndex > startIndex; endIndex -= 1) {
      const candidate = tokens.slice(startIndex, endIndex).join(" ");

      if (commandBodyParses(candidate)) {
        bestEndIndex = endIndex;
        break;
      }
    }

    if (bestEndIndex <= startIndex) {
      if (segments.length > 0) {
        segments.push(tokens.slice(startIndex).join(" "));
        return segments;
      }

      return [body];
    }

    segments.push(tokens.slice(startIndex, bestEndIndex).join(" "));
    startIndex = bestEndIndex;
  }

  return segments.length > 1 ? segments : [body];
}

function commandBodyParses(body: string) {
  return parseAtcCommand(`${implicitParserCallsign} ${restoreProtectedAnd(body)}`).ok;
}

function restoreProtectedAnd(segment: string) {
  return segment
    .replace(new RegExp(protectedAndToken, "g"), "AND")
    .replace(new RegExp(protectedThenToken, "g"), "THEN")
    .trim();
}

function inheritPublishedHoldFixFromPreviousCommand(commands: ParsedAtcCommand[]) {
  let lastDirectFixId: string | null = null;

  return commands.map((command) => {
    if (command.intent === "DIRECT_TO_FIX" && typeof command.slots.fix_id === "string") {
      lastDirectFixId = command.slots.fix_id;
      return command;
    }

    if (
      command.intent === "HOLD_AT_FIX" &&
      typeof command.slots.fix_id !== "string" &&
      !command.slots.hold_at_present_position &&
      lastDirectFixId
    ) {
      return {
        ...command,
        slots: {
          ...command.slots,
          fix_id: lastDirectFixId,
          direct_to_hold: true
        }
      };
    }

    return command;
  });
}
