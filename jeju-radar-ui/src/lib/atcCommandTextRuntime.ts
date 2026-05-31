import {
  normalizeAtcPhrase,
  parseAtcCommand,
  type ParsedAtcCommand
} from "./atcCommandParser";
import {
  parseAtcCommandBatch,
  type ParsedAtcCommandBatch
} from "./atcCommandBatch";
import {
  atcParsedDebugText,
  nowForAtcDebugMs,
  type AtcCommandDebugMeta,
  type AtcCommandDebugState,
  type PendingAtcCommandDebug
} from "./atcCommandDebug";

export interface AtcCommandDebugDraft {
  pending: PendingAtcCommandDebug;
  visible: AtcCommandDebugState;
}

export type PreparedAtcCommandText =
  | {
      status: "pending_confirmation";
      affirmed: boolean;
      debugDraft: AtcCommandDebugDraft;
    }
  | {
      status: "batch";
      batch: ParsedAtcCommandBatch;
      debugDraft: AtcCommandDebugDraft;
    }
  | {
      status: "single";
      batch: ParsedAtcCommandBatch;
      parsed: ParsedAtcCommand;
      debugDraft: AtcCommandDebugDraft;
    };

export function prepareAtcCommandText(
  rawCommand: string,
  debugMeta?: AtcCommandDebugMeta,
  nowMs = nowForAtcDebugMs
): PreparedAtcCommandText {
  const parseStartedAtMs = nowMs();
  const normalizedCommand = normalizeAtcPhrase(rawCommand);

  if (isAffirmResponse(normalizedCommand)) {
    return {
      status: "pending_confirmation",
      affirmed: true,
      debugDraft: buildAtcCommandDebugDraft({
        meta: debugMeta,
        parsed: "AFFIRM",
        parseMs: nowMs() - parseStartedAtMs,
        applyStartedAtMs: nowMs(),
        fallbackRawCommand: rawCommand,
        startedAtMs: nowMs()
      })
    };
  }

  if (isNegativeResponse(normalizedCommand)) {
    return {
      status: "pending_confirmation",
      affirmed: false,
      debugDraft: buildAtcCommandDebugDraft({
        meta: debugMeta,
        parsed: "NEGATIVE",
        parseMs: nowMs() - parseStartedAtMs,
        applyStartedAtMs: nowMs(),
        fallbackRawCommand: rawCommand,
        startedAtMs: nowMs()
      })
    };
  }

  const batch = parseAtcCommandBatch(rawCommand);
  const debugMetaWithRepair =
    debugMeta && debugMeta.normalized !== batch.normalized
      ? {
          ...debugMeta,
          normalized: batch.normalized
        }
      : debugMeta;
  const debugDraft = buildAtcCommandDebugDraft({
    meta: debugMetaWithRepair,
    parsed: atcParsedDebugText(batch.commands),
    parseMs: nowMs() - parseStartedAtMs,
    applyStartedAtMs: nowMs(),
    fallbackRawCommand: rawCommand,
    normalizedOverride: batch.normalized,
    startedAtMs: nowMs()
  });

  if (batch.commands.length > 1) {
    return {
      status: "batch",
      batch,
      debugDraft
    };
  }

  const parsed = batch.commands[0] ?? parseAtcCommand(rawCommand);

  if (parsed.intent === "AFFIRM" || parsed.intent === "NEGATIVE") {
    return {
      status: "pending_confirmation",
      affirmed: parsed.intent === "AFFIRM",
      debugDraft
    };
  }

  return {
    status: "single",
    batch,
    parsed,
    debugDraft
  };
}

export function buildAtcCommandDebugDraft({
  meta,
  parsed,
  parseMs,
  applyStartedAtMs,
  fallbackRawCommand,
  normalizedOverride,
  startedAtMs = nowForAtcDebugMs()
}: {
  meta: AtcCommandDebugMeta | undefined;
  parsed: string;
  parseMs: number;
  applyStartedAtMs: number;
  fallbackRawCommand: string;
  normalizedOverride?: string;
  startedAtMs?: number;
}): AtcCommandDebugDraft {
  const source = meta?.source ?? "TEXT";
  const raw = meta?.raw ?? fallbackRawCommand;
  const normalized = meta?.normalized ?? normalizedOverride ?? normalizeAtcPhrase(fallbackRawCommand);
  const latency = {
    stt_ms: meta?.sttMs,
    normalize_ms: meta?.normalizeMs,
    parse_ms: parseMs
  };
  const pending = {
    source,
    raw,
    normalized,
    parsed,
    startedAtMs: meta?.startedAtMs ?? startedAtMs,
    applyStartedAtMs,
    latency
  };

  return {
    pending,
    visible: {
      source,
      raw,
      normalized,
      parsed,
      applied: "PENDING",
      latency
    }
  };
}

function isAffirmResponse(normalizedCommand: string) {
  return ["AFFIRM", "AFFIRMATIVE", "YES", "어펌", "어펌입니다"].includes(normalizedCommand);
}

function isNegativeResponse(normalizedCommand: string) {
  return ["NEGATIVE", "NO", "취소", "아니오"].includes(normalizedCommand);
}
