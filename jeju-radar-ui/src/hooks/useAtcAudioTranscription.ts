import { useCallback, useRef } from "react";
import type { AtcCommandDebugMeta, AtcCommandDebugState } from "../lib/atcCommandDebug";
import type { AtcConsoleResult } from "../lib/atcConsoleViewModel";
import {
  atcAudioTranscriptionRequestKey,
  runAtcAudioTranscription,
  type AtcSpeechStatusUpdate
} from "../lib/atcAudioTranscriptionRuntime";
import type { AtcSttContext } from "../lib/atcSttContext";
import type { AtcTranscriptNormalizationResult } from "../lib/atcTranscriptNormalizer";
import type { PttLiveSample } from "../lib/pttLiveSampleSession";
import type { PttVoiceTraceLabel } from "../lib/pttVoiceTrace";
import type { AircraftState, RadarDataset, RunwayMode } from "../lib/types";

interface RecordPttVoiceTraceOptions {
  label?: PttVoiceTraceLabel;
  liveSample?: PttLiveSample | null;
  normalization?: AtcTranscriptNormalizationResult | null;
  sttContextDisplay?: string | null;
}

interface UseAtcAudioTranscriptionArgs {
  aircraftTraffic: AircraftState[];
  applyAtcCommandText: (rawCommand: string, debugMeta?: AtcCommandDebugMeta) => void;
  dataset: RadarDataset | null;
  liveSample?: PttLiveSample | null;
  recordPttVoiceTrace: (
    debug: AtcCommandDebugState,
    consoleResult: AtcConsoleResult,
    options?: RecordPttVoiceTraceOptions
  ) => void;
  selectedRunway: RunwayMode;
  setAtcCommandText: (value: string) => void;
  setAtcConsoleResult: (result: AtcConsoleResult) => void;
  setAtcSpeechStatus: (status: AtcSpeechStatusUpdate) => void;
  setLastAtcCommandDebug: (debug: AtcCommandDebugState | null) => void;
  setLastSttContext: (context: AtcSttContext | null) => void;
  setLastTranscriptNormalization: (normalization: AtcTranscriptNormalizationResult | null) => void;
}

export function useAtcAudioTranscription({
  aircraftTraffic,
  applyAtcCommandText,
  dataset,
  liveSample,
  recordPttVoiceTrace,
  selectedRunway,
  setAtcCommandText,
  setAtcConsoleResult,
  setAtcSpeechStatus,
  setLastAtcCommandDebug,
  setLastSttContext,
  setLastTranscriptNormalization
}: UseAtcAudioTranscriptionArgs) {
  const atcTranscriptionRequestKeyRef = useRef<string | null>(null);

  const handleAtcAudioBlob = useCallback(
    async (audioBlob: Blob) => {
      const requestKey = atcAudioTranscriptionRequestKey(audioBlob);
      atcTranscriptionRequestKeyRef.current = requestKey;

      await runAtcAudioTranscription({
        aircraftTraffic,
        applyAtcCommandText,
        audioBlob,
        dataset,
        isCurrentRequest: () => atcTranscriptionRequestKeyRef.current === requestKey,
        liveSample,
        recordPttVoiceTrace,
        selectedRunway,
        setAtcCommandText,
        setAtcConsoleResult,
        setAtcSpeechStatus,
        setLastAtcCommandDebug,
        setLastSttContext,
        setLastTranscriptNormalization
      });
    },
    [
      aircraftTraffic,
      applyAtcCommandText,
      dataset,
      liveSample,
      recordPttVoiceTrace,
      selectedRunway,
      setAtcCommandText,
      setAtcConsoleResult,
      setAtcSpeechStatus,
      setLastAtcCommandDebug,
      setLastSttContext,
      setLastTranscriptNormalization
    ]
  );

  return { handleAtcAudioBlob };
}
