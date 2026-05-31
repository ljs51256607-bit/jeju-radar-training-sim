import { useRef, useState } from "react";
import type { AtcCommandDebugState } from "../lib/atcCommandDebug";
import type { AtcConsoleResult } from "../lib/atcConsoleViewModel";
import type { AtcTranscriptNormalizationResult } from "../lib/atcTranscriptNormalizer";
import type { PttLiveSample } from "../lib/pttLiveSampleSession";
import {
  appendPttVoiceTrace,
  buildPttVoiceTraceEntry,
  clearPttVoiceTraces,
  labelPttVoiceTrace,
  loadPttVoiceTraces,
  pttVoiceTraceExportJson,
  savePttVoiceTraces,
  summarizePttVoiceTraces,
  type PttVoiceTraceLabel
} from "../lib/pttVoiceTrace";

interface UsePttVoiceTraceStoreOptions {
  lastTranscriptNormalization: AtcTranscriptNormalizationResult | null;
  sttContextDisplay: string | null;
}

interface RecordPttVoiceTraceOptions {
  label?: PttVoiceTraceLabel;
  liveSample?: PttLiveSample | null;
  normalization?: AtcTranscriptNormalizationResult | null;
  sttContextDisplay?: string | null;
}

export function usePttVoiceTraceStore({
  lastTranscriptNormalization,
  sttContextDisplay
}: UsePttVoiceTraceStoreOptions) {
  const lastRecordedPttTraceKeyRef = useRef<string | null>(null);
  const [pttVoiceTraces, setPttVoiceTraces] = useState(() => loadPttVoiceTraces());
  const [pttTraceExportStatus, setPttTraceExportStatus] = useState<string | null>(null);

  function recordPttVoiceTrace(
    debug: AtcCommandDebugState,
    consoleResult: AtcConsoleResult,
    options: RecordPttVoiceTraceOptions = {}
  ) {
    const traceKey = [
      debug.raw,
      debug.normalized,
      debug.parsed,
      debug.applied,
      consoleResult.status,
      consoleResult.response
    ].join("|");

    if (lastRecordedPttTraceKeyRef.current === traceKey) {
      return;
    }

    lastRecordedPttTraceKeyRef.current = traceKey;
    const entry = buildPttVoiceTraceEntry({
      debug,
      consoleResult,
      liveSample: options.liveSample ?? null,
      normalization: "normalization" in options ? options.normalization ?? null : lastTranscriptNormalization,
      sttContextDisplay: "sttContextDisplay" in options ? options.sttContextDisplay ?? null : sttContextDisplay
    });
    const labelledEntry = options.label ? { ...entry, label: options.label } : entry;

    setPttVoiceTraces((currentTraces) => {
      const nextTraces = appendPttVoiceTrace(currentTraces, labelledEntry);
      savePttVoiceTraces(nextTraces);
      return nextTraces;
    });
    setPttTraceExportStatus(null);
  }

  function labelLatestPttVoiceTrace(label: PttVoiceTraceLabel) {
    const latestTrace = pttVoiceTraces[0];

    if (!latestTrace) {
      return;
    }

    setPttVoiceTraces((currentTraces) => {
      const nextTraces = labelPttVoiceTrace(currentTraces, latestTrace.id, label);
      savePttVoiceTraces(nextTraces);
      return nextTraces;
    });
    setPttTraceExportStatus(`LABEL ${label}`);
  }

  function exportPttVoiceTraceJson() {
    const exportJson = pttVoiceTraceExportJson(pttVoiceTraces, {
      exportSource: "ui_ptt_console"
    });

    if (typeof window === "undefined") {
      return;
    }

    const blob = new Blob([exportJson], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    anchor.href = url;
    anchor.download = `ptt-voice-traces-${stamp}.json`;
    anchor.click();
    window.URL.revokeObjectURL(url);
    setPttTraceExportStatus(`EXPORTED ${pttVoiceTraces.length}`);
  }

  function clearStoredPttVoiceTraces() {
    clearPttVoiceTraces();
    setPttVoiceTraces([]);
    setPttTraceExportStatus("CLEARED");
  }

  return {
    pttVoiceTraces,
    pttTraceExportStatus,
    pttVoiceTraceSummary: summarizePttVoiceTraces(pttVoiceTraces),
    latestPttVoiceTrace: pttVoiceTraces[0] ?? null,
    recordPttVoiceTrace,
    labelLatestPttVoiceTrace,
    exportPttVoiceTraceJson,
    clearStoredPttVoiceTraces
  };
}
