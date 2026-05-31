import type { ParsedAtcCommand } from "./atcCommandParser";

export interface AtcSemanticCommandIssue {
  kind:
    | "missing_crossing_altitude"
    | "missing_altitude"
    | "missing_heading"
    | "missing_speed"
    | "missing_fix"
    | "unrecognized_instruction";
  detail: string;
  sayAgainText: string;
}

export function semanticIssueForParsedCommand(command: ParsedAtcCommand): AtcSemanticCommandIssue {
  const body = command.body.trim().toUpperCase();

  if (/\bCROSS\s+[A-Z0-9]{2,6}\s+(?:AT\s+OR\s+BELOW|BELOW)\b/.test(body) && !/\d/.test(body)) {
    return {
      kind: "missing_crossing_altitude",
      detail: "missing crossing altitude",
      sayAgainText: "crossing altitude"
    };
  }

  if (/\b(?:DESCEND|CLIMB|MAINTAIN)\b/.test(body) && !/\d/.test(body)) {
    return {
      kind: "missing_altitude",
      detail: "missing altitude",
      sayAgainText: "altitude"
    };
  }

  if (/\b(?:HEADING|TURN\s+LEFT|TURN\s+RIGHT|LEFT\s+TURN|RIGHT\s+TURN)\b/.test(body) && !/\d/.test(body)) {
    return {
      kind: "missing_heading",
      detail: "missing heading",
      sayAgainText: "heading"
    };
  }

  if (/\b(?:SPEED|REDUCE|INCREASE)\b/.test(body) && !/\d/.test(body) && !/\bMINIMUM\b/.test(body)) {
    return {
      kind: "missing_speed",
      detail: "missing speed",
      sayAgainText: "speed"
    };
  }

  if (/\b(?:DIRECT|HOLD\s+AT)\b/.test(body) && !/\b[A-Z0-9]{2,6}\b/.test(body.replace(/\b(?:DIRECT|HOLD|AT|TO)\b/g, ""))) {
    return {
      kind: "missing_fix",
      detail: "missing fix",
      sayAgainText: "fix"
    };
  }

  return {
    kind: "unrecognized_instruction",
    detail: "unrecognized instruction",
    sayAgainText: "last instruction"
  };
}

export function semanticIssueSummary(issues: AtcSemanticCommandIssue[]) {
  const uniqueTexts = [...new Set(issues.map((issue) => issue.sayAgainText).filter(Boolean))];

  if (uniqueTexts.length === 0) {
    return "last instruction";
  }

  if (uniqueTexts.length === 1) {
    return uniqueTexts[0];
  }

  if (uniqueTexts.length === 2) {
    return `${uniqueTexts[0]} and ${uniqueTexts[1]}`;
  }

  return `${uniqueTexts.slice(0, -1).join(", ")}, and ${uniqueTexts[uniqueTexts.length - 1]}`;
}
