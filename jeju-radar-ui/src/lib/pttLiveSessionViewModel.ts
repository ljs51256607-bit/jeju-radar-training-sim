import type { PttVoiceTraceSummary } from "./pttVoiceTrace";

export const PTT_LIVE_SESSION_MIN_SAMPLES = 30;
export const PTT_LIVE_SESSION_TARGET_SAMPLES = 50;

export type PttLiveSessionState = "collecting" | "labeling" | "export_ready";

export interface PttLiveSessionViewModel {
  state: PttLiveSessionState;
  progressText: string;
  labelText: string;
  actionText: string;
  qualityText: string;
  missingSamples: number;
  missingLabels: number;
}

export function pttLiveSessionViewModel(
  summary: PttVoiceTraceSummary,
  minSamples = PTT_LIVE_SESSION_MIN_SAMPLES,
  targetSamples = PTT_LIVE_SESSION_TARGET_SAMPLES
): PttLiveSessionViewModel {
  const progressTarget = summary.total < minSamples ? minSamples : targetSamples;
  const cappedTotal = Math.min(summary.total, progressTarget);
  const missingSamples = Math.max(0, minSamples - summary.total);
  const missingLabels = Math.max(0, summary.total - summary.labelled);
  const state: PttLiveSessionState =
    missingSamples > 0 ? "collecting" : missingLabels > 0 ? "labeling" : "export_ready";

  return {
    state,
    progressText: `LIVE ${cappedTotal}/${progressTarget}`,
    labelText: `LABEL ${summary.labelled}/${summary.total}`,
    actionText:
      state === "collecting"
        ? `NEED ${missingSamples}`
        : state === "labeling"
          ? `LABEL ${missingLabels}`
          : "EXPORT READY",
    qualityText: `GOOD ${summary.good} / FAIL ${summary.fail}`,
    missingSamples,
    missingLabels
  };
}
