import type { AtcCommandDebugState } from "./atcCommandDebug";
import type { AtcRadioExchangePhase } from "./atcConsoleViewModel";
import type { PttLiveSample } from "./pttLiveSampleSession";
import type { PilotResponsePayload } from "./pilotResponseLayer";
import type { AtcTranscriptNormalizationResult } from "./atcTranscriptNormalizer";

export type PttVoiceTraceResult =
  | "applied"
  | "partial_applied"
  | "confirm"
  | "say_again"
  | "unable"
  | "silent"
  | "error";

export type PttVoiceTraceLabel =
  | "GOOD"
  | "STT_FAIL"
  | "WRONG_CALLSIGN"
  | "WRONG_NUMBER"
  | "WRONG_FIX"
  | "PARSER_FAIL"
  | "UNNECESSARY_SAY_AGAIN";

export type PttVoiceTraceCaptureMode =
  | "live_ptt"
  | "synthetic_regression"
  | "verify_fixture";

export interface PttVoiceTraceEntry {
  id: string;
  created_at: string;
  source: "VOICE";
  capture_mode?: PttVoiceTraceCaptureMode;
  raw_stt_text: string;
  normalized_text: string;
  normalization_reasons: string[];
  normalization_warnings: string[];
  parsed_debug: string;
  applied_debug: string;
  response_status: string;
  response_text: string;
  response_condition?: string;
  radio_exchange_phase?: AtcRadioExchangePhase;
  parser_intent?: string | null;
  parser_pattern_id?: string | null;
  stt_context_display?: string | null;
  live_sample?: PttVoiceTraceLiveSample | null;
  latency_ms: {
    stt?: number;
    normalize?: number;
    parse?: number;
    apply?: number;
    total?: number;
  };
  result: PttVoiceTraceResult;
  label?: PttVoiceTraceLabel;
  label_note?: string;
}

export type PttVoiceTraceLiveSample = Pick<
  PttLiveSample,
  "index" | "id" | "source" | "source_case_id" | "category" | "phrase" | "expected_intents" | "focus"
>;

export interface PttVoiceTraceSummary {
  total: number;
  labelled: number;
  applied: number;
  partial_applied: number;
  say_again: number;
  unable: number;
  silent: number;
  error: number;
  good: number;
  fail: number;
  avg_total_latency_ms: number | null;
}

export interface PttVoiceTraceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface PttVoiceTraceExportOptions {
  exportSource?: "ui_ptt_console" | "synthetic_regression" | "verify_fixture";
}

export const PTT_VOICE_TRACE_STORAGE_KEY = "jeju.pttVoiceTraces.v1";
export const PTT_VOICE_TRACE_LIMIT = 200;

interface AtcConsoleResultForTrace {
  status: string;
  response: string;
  detail?: string;
  pilot_response?: PilotResponsePayload;
  radio_exchange_phase?: AtcRadioExchangePhase;
}

export function buildPttVoiceTraceEntry({
  debug,
  consoleResult,
  normalization,
  captureMode = "live_ptt",
  liveSample,
  sttContextDisplay,
  now = new Date()
}: {
  debug: AtcCommandDebugState;
  consoleResult: AtcConsoleResultForTrace;
  normalization: AtcTranscriptNormalizationResult | null;
  captureMode?: PttVoiceTraceCaptureMode;
  liveSample?: PttVoiceTraceLiveSample | null;
  sttContextDisplay?: string | null;
  now?: Date;
}): PttVoiceTraceEntry {
  return {
    id: `ptt-${now.toISOString()}-${traceHash(`${debug.raw}|${debug.normalized}|${debug.parsed}`)}`,
    created_at: now.toISOString(),
    source: "VOICE",
    capture_mode: captureMode,
    raw_stt_text: debug.raw,
    normalized_text: debug.normalized,
    normalization_reasons: normalization?.reasons ?? [],
    normalization_warnings: normalization?.warnings ?? [],
    parsed_debug: debug.parsed,
    applied_debug: debug.applied,
    response_status: consoleResult.status,
    response_text: consoleResult.response,
    response_condition: consoleResult.pilot_response?.condition,
    radio_exchange_phase: consoleResult.radio_exchange_phase,
    parser_intent: consoleResult.pilot_response?.parser_intent,
    parser_pattern_id: consoleResult.pilot_response?.parser_pattern_id,
    stt_context_display: sttContextDisplay ?? null,
    live_sample: liveSample ? normalizeLiveSampleForTrace(liveSample) : null,
    latency_ms: {
      stt: debug.latency.stt_ms,
      normalize: debug.latency.normalize_ms,
      parse: debug.latency.parse_ms,
      apply: debug.latency.apply_ms,
      total: debug.latency.total_ms
    },
    result: traceResultFromConsole(consoleResult)
  };
}

export function appendPttVoiceTrace(
  traces: PttVoiceTraceEntry[],
  entry: PttVoiceTraceEntry,
  limit = PTT_VOICE_TRACE_LIMIT
) {
  return [entry, ...traces.filter((trace) => trace.id !== entry.id)].slice(0, limit);
}

export function labelPttVoiceTrace(
  traces: PttVoiceTraceEntry[],
  traceId: string,
  label: PttVoiceTraceLabel
) {
  return traces.map((trace) =>
    trace.id === traceId
      ? {
          ...trace,
          label
        }
      : trace
  );
}

export function summarizePttVoiceTraces(traces: PttVoiceTraceEntry[]): PttVoiceTraceSummary {
  const totalLatencyValues = traces
    .map((trace) => trace.latency_ms.total)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  return {
    total: traces.length,
    labelled: traces.filter((trace) => Boolean(trace.label)).length,
    applied: traces.filter((trace) => trace.result === "applied").length,
    partial_applied: traces.filter((trace) => trace.result === "partial_applied").length,
    say_again: traces.filter((trace) => trace.result === "say_again").length,
    unable: traces.filter((trace) => trace.result === "unable").length,
    silent: traces.filter((trace) => trace.result === "silent").length,
    error: traces.filter((trace) => trace.result === "error").length,
    good: traces.filter((trace) => trace.label === "GOOD").length,
    fail: traces.filter((trace) => trace.label && trace.label !== "GOOD").length,
    avg_total_latency_ms:
      totalLatencyValues.length > 0
        ? Math.round(totalLatencyValues.reduce((sum, value) => sum + value, 0) / totalLatencyValues.length)
        : null
  };
}

export function loadPttVoiceTraces(storage: PttVoiceTraceStorage | undefined = browserStorage()) {
  if (!storage) {
    return [];
  }

  try {
    const raw = storage.getItem(PTT_VOICE_TRACE_STORAGE_KEY);

    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);

    return Array.isArray(parsed) ? parsed.filter(isPttVoiceTraceEntry).slice(0, PTT_VOICE_TRACE_LIMIT) : [];
  } catch {
    return [];
  }
}

export function savePttVoiceTraces(
  traces: PttVoiceTraceEntry[],
  storage: PttVoiceTraceStorage | undefined = browserStorage()
) {
  if (!storage) {
    return;
  }

  storage.setItem(PTT_VOICE_TRACE_STORAGE_KEY, JSON.stringify(traces.slice(0, PTT_VOICE_TRACE_LIMIT)));
}

export function clearPttVoiceTraces(storage: PttVoiceTraceStorage | undefined = browserStorage()) {
  storage?.removeItem(PTT_VOICE_TRACE_STORAGE_KEY);
}

export function pttVoiceTraceExportJson(
  traces: PttVoiceTraceEntry[],
  options: PttVoiceTraceExportOptions = {}
) {
  return JSON.stringify(
    {
      metadata: {
        id: "ptt_voice_trace_export_v1",
        exported_at: new Date().toISOString(),
        export_source: options.exportSource ?? "unspecified",
        evidence_contract: "ptt_live_trace_export_v1",
        trace_count: traces.length,
        sample_trace_count: traces.filter((trace) => trace.live_sample).length,
        live_trace_count: traces.filter((trace) => trace.capture_mode === "live_ptt").length,
        live_sample_trace_count: traces.filter((trace) => trace.capture_mode === "live_ptt" && trace.live_sample).length,
        capture_modes: countBy(traces, (trace) => trace.capture_mode ?? "legacy_voice")
      },
      summary: summarizePttVoiceTraces(traces),
      traces
    },
    null,
    2
  );
}

function traceResultFromConsole(consoleResult: AtcConsoleResultForTrace): PttVoiceTraceResult {
  if (consoleResult.pilot_response?.condition === "PARTIAL_COMMAND_APPLIED") {
    return "partial_applied";
  }

  switch (consoleResult.status) {
    case "readback":
      return "applied";
    case "confirm":
      return "confirm";
    case "say_again":
      return "say_again";
    case "unable":
      return "unable";
    case "silent":
      return "silent";
    case "error":
      return "error";
    default:
      return consoleResult.detail?.toUpperCase().includes("ERROR") ? "error" : "silent";
  }
}

function normalizeLiveSampleForTrace(sample: PttVoiceTraceLiveSample): PttVoiceTraceLiveSample {
  return {
    index: sample.index,
    id: sample.id,
    source: sample.source,
    source_case_id: sample.source_case_id,
    category: sample.category,
    phrase: sample.phrase,
    expected_intents: [...sample.expected_intents],
    focus: [...sample.focus]
  };
}

function isPttVoiceTraceEntry(value: unknown): value is PttVoiceTraceEntry {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as PttVoiceTraceEntry).id === "string" &&
    (value as PttVoiceTraceEntry).source === "VOICE"
  );
}

function browserStorage(): PttVoiceTraceStorage | undefined {
  return typeof window !== "undefined" ? window.localStorage : undefined;
}

function traceHash(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function countBy<T>(values: T[], keyFn: (value: T) => string) {
  return Object.fromEntries(
    Object.entries(values.reduce<Record<string, number>>((counts, value) => {
      const key = keyFn(value);
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {})).sort(([first], [second]) => first.localeCompare(second))
  );
}
