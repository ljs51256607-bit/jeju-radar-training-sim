import { atcCommandSummary, type ParsedAtcCommand } from "./atcCommandParser";

export type AtcCommandDebugSource = "VOICE" | "TEXT";

export interface AtcCommandLatencyBreakdown {
  stt_ms?: number;
  normalize_ms?: number;
  parse_ms?: number;
  apply_ms?: number;
  total_ms?: number;
}

export interface AtcCommandDebugState {
  source: AtcCommandDebugSource;
  raw: string;
  normalized: string;
  parsed: string;
  applied: string;
  latency: AtcCommandLatencyBreakdown;
}

export interface PendingAtcCommandDebug {
  source: AtcCommandDebugSource;
  raw: string;
  normalized: string;
  parsed: string;
  startedAtMs: number;
  applyStartedAtMs: number;
  latency: AtcCommandLatencyBreakdown;
}

export interface AtcCommandDebugMeta {
  source: AtcCommandDebugSource;
  raw: string;
  normalized: string;
  startedAtMs: number;
  sttMs?: number;
  normalizeMs?: number;
}

interface AtcConsoleResultLike {
  status: string;
  detail?: string;
}

export function nowForAtcDebugMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function atcLatencyDebugText(latency: AtcCommandLatencyBreakdown) {
  return [
    `STT ${formatAtcLatencyMs(latency.stt_ms)}`,
    `NORM ${formatAtcLatencyMs(latency.normalize_ms)}`,
    `PARSE ${formatAtcLatencyMs(latency.parse_ms)}`,
    `APPLY ${formatAtcLatencyMs(latency.apply_ms)}`,
    `TOTAL ${formatAtcLatencyMs(latency.total_ms)}`
  ].join(" / ");
}

export function atcConsoleAppliedDebugText(result: AtcConsoleResultLike) {
  const status = result.status.toUpperCase();
  return result.detail ? `${status} - ${result.detail}` : status;
}

export function atcParsedDebugText(commands: ParsedAtcCommand[]) {
  if (commands.length === 0) {
    return "NO COMMAND";
  }

  return commands.map(atcParsedCommandDebugText).join(" / ");
}

function formatAtcLatencyMs(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.max(0, Math.round(value))}ms` : "-";
}

function atcParsedCommandDebugText(command: ParsedAtcCommand) {
  const callsign = command.callsign ?? "NO CALLSIGN";
  const intent = command.intent ?? "NO MATCH";
  const slots = atcSlotDebugText(command.slots);
  const summary = command.intent ? atcCommandSummary(command) : command.body;

  return [callsign, intent, slots, summary].filter(Boolean).join(" ");
}

function atcSlotDebugText(slots: Record<string, unknown>) {
  const parts = Object.entries(slots)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${atcDebugSlotKey(key)}=${atcDebugSlotValue(value)}`);

  return parts.length > 0 ? `[${parts.join(" ")}]` : "";
}

function atcDebugSlotKey(key: string) {
  const labels: Record<string, string> = {
    heading_deg: "HDG",
    speed_kt: "SPD",
    altitude_ft: "ALT",
    vertical_rate_fpm: "VS",
    fix_id: "FIX",
    runway: "RWY",
    turn_direction: "TURN",
    speed_limit_direction: "LIM"
  };

  return labels[key] ?? key.toUpperCase();
}

function atcDebugSlotValue(value: unknown) {
  if (typeof value === "object") {
    return JSON.stringify(value).replace(/\s+/g, "").slice(0, 48);
  }

  return String(value).toUpperCase();
}
