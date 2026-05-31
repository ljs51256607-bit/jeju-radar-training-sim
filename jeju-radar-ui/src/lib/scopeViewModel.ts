import type { AtcSpeechStatus } from "./atcSpeechClient";
import type { ScenarioOverlayState } from "./scenarioStorage";
import type { SurfaceMode } from "./types";

export const DEFAULT_SCENARIO_OVERLAYS: ScenarioOverlayState = {
  traffic: true,
  coastline: true,
  airways: true,
  specialUse: true,
  boundary: true,
  surveillanceBoundary: false,
  mva: true,
  guides: true,
  rwy31Sid: true,
  sidReference: true,
  labels: true,
  rings: true,
  secondaryRunway: false
};

export const SCOPE_OVERLAY_LABELS: Record<keyof ScenarioOverlayState, string> = {
  traffic: "Traffic",
  coastline: "Coast",
  airways: "Airway",
  specialUse: "MOA/CATA",
  boundary: "TMA ENR",
  surveillanceBoundary: "MVA Ref",
  mva: "MVA",
  guides: "Guides",
  rwy31Sid: "RWY31 SID",
  sidReference: "SID Ref",
  labels: "Labels",
  rings: "Rings",
  secondaryRunway: "RWY 13/31"
};

const EXACT_SCOPE_OVERLAY_KEYS = new Set<keyof ScenarioOverlayState>([
  "coastline",
  "airways",
  "specialUse",
  "boundary",
  "mva",
  "guides",
  "rwy31Sid",
  "labels"
]);

export const COMPACT_SCOPE_OVERLAY_KEYS: Array<keyof ScenarioOverlayState> = [
  "boundary",
  "mva",
  "guides",
  "rwy31Sid",
  "labels",
  "coastline",
  "airways",
  "specialUse"
];

export const SUPPORT_SCOPE_OVERLAY_KEYS: Array<keyof ScenarioOverlayState> = [
  "traffic",
  "rings",
  "surveillanceBoundary",
  "secondaryRunway",
  "sidReference"
];

interface AtcMicrophoneHudStatus {
  state: AtcSpeechStatus;
  detail: string;
}

export function effectiveScopeOverlays(
  surfaceMode: SurfaceMode,
  overlays: ScenarioOverlayState
): ScenarioOverlayState {
  if (surfaceMode !== "exact") {
    return overlays;
  }

  return {
    ...overlays,
    rings: false,
    surveillanceBoundary: false,
    secondaryRunway: false,
    sidReference: false
  };
}

export function scopeOverlayCounts(overlays: ScenarioOverlayState) {
  const entries = Object.entries(overlays) as Array<[keyof ScenarioOverlayState, boolean]>;

  return {
    exact: entries.filter(([key, enabled]) => enabled && EXACT_SCOPE_OVERLAY_KEYS.has(key)).length,
    support: entries.filter(([key, enabled]) => enabled && !EXACT_SCOPE_OVERLAY_KEYS.has(key)).length
  };
}

export function atcMicrophoneHudViewModel(
  atcSpeechStatus: AtcMicrophoneHudStatus,
  atcMicLevel: number
) {
  const isLow = atcSpeechStatus.state === "recording" && atcMicLevel < 0.04;
  const barCount =
    atcSpeechStatus.state === "recording"
      ? Math.max(1, Math.min(10, Math.ceil(atcMicLevel * 10)))
      : atcSpeechStatus.state === "transcribing" || atcSpeechStatus.state === "applied"
        ? 10
        : 0;
  const primary =
    atcSpeechStatus.state === "recording"
      ? "REC"
      : atcSpeechStatus.state === "transcribing"
        ? "STT"
        : atcSpeechStatus.state === "applied"
          ? "OK"
          : atcSpeechStatus.state === "error"
            ? "ERR"
            : atcSpeechStatus.state === "unsupported"
              ? "NO MIC"
              : "PTT";
  const secondary =
    atcSpeechStatus.state === "recording"
      ? isLow
        ? "LOW MIC"
        : "LIVE"
      : atcSpeechStatus.state === "idle"
        ? "CTRL"
        : atcSpeechStatus.detail;

  return {
    barCount,
    isLow,
    primary,
    secondary
  };
}
