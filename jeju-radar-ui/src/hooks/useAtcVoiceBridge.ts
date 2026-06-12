import {
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import type {
  AtcCommandDebugMeta,
  AtcCommandDebugState
} from "../lib/atcCommandDebug";
import type {
  AtcConsoleResult
} from "../lib/atcConsoleViewModel";
import type { AtcSttContext } from "../lib/atcSttContext";
import type { AtcTranscriptNormalizationResult } from "../lib/atcTranscriptNormalizer";
import type { PilotVoiceMode } from "../lib/pilotVoiceClient";
import type { PttLiveSample } from "../lib/pttLiveSampleSession";
import type { PttVoiceTraceLabel } from "../lib/pttVoiceTrace";
import type {
  AircraftState,
  RadarDataset,
  RunwayMode
} from "../lib/types";
import { useAtcAudioTranscription } from "./useAtcAudioTranscription";
import { useAtcPushToTalkRecorder } from "./useAtcPushToTalkRecorder";
import { usePilotSpeechPlayback } from "./usePilotSpeechPlayback";
import { usePilotVoiceResponse } from "./usePilotVoiceResponse";

interface RecordPttVoiceTraceOptions {
  label?: PttVoiceTraceLabel;
  liveSample?: PttLiveSample | null;
  normalization?: AtcTranscriptNormalizationResult | null;
  sttContextDisplay?: string | null;
}

interface UseAtcVoiceBridgeOptions {
  aircraftTraffic: AircraftState[];
  applyAtcCommandText: (rawCommand: string, debugMeta?: AtcCommandDebugMeta) => void;
  atcConsoleResult: AtcConsoleResult;
  dataset: RadarDataset | null;
  liveSample: PttLiveSample | null;
  publicDemoMode?: boolean;
  recordPttVoiceTrace: (
    debug: AtcCommandDebugState,
    consoleResult: AtcConsoleResult,
    options?: RecordPttVoiceTraceOptions
  ) => void;
  selectedRunway: RunwayMode;
  setAtcCommandText: Dispatch<SetStateAction<string>>;
  setAtcConsoleResult: Dispatch<SetStateAction<AtcConsoleResult>>;
  setLastAtcCommandDebug: Dispatch<SetStateAction<AtcCommandDebugState | null>>;
  setLastSttContext: Dispatch<SetStateAction<AtcSttContext | null>>;
  setLastTranscriptNormalization: Dispatch<
    SetStateAction<AtcTranscriptNormalizationResult | null>
  >;
}

export function useAtcVoiceBridge({
  aircraftTraffic,
  applyAtcCommandText,
  atcConsoleResult,
  dataset,
  liveSample,
  publicDemoMode = false,
  recordPttVoiceTrace,
  selectedRunway,
  setAtcCommandText,
  setAtcConsoleResult,
  setLastAtcCommandDebug,
  setLastSttContext,
  setLastTranscriptNormalization
}: UseAtcVoiceBridgeOptions) {
  const [pilotVoiceMode, setPilotVoiceMode] = useState<PilotVoiceMode>("deterministic");
  const atcAudioBlobHandlerRef = useRef<(audioBlob: Blob) => void>(() => undefined);
  const {
    cyclePilotSpeechMode,
    pilotSpeechEnabled,
    pilotSpeechFastMode,
    pilotSpeechStatus,
    playPilotSpeech
  } = usePilotSpeechPlayback({ disabled: publicDemoMode });
  const {
    atcMicLevel,
    atcSpeechStatus,
    setAtcSpeechStatus,
    togglePushToTalkRecording
  } = useAtcPushToTalkRecorder({
    disabled: publicDemoMode,
    onAudioBlob: (audioBlob) => atcAudioBlobHandlerRef.current(audioBlob)
  });
  const { handleAtcAudioBlob } = useAtcAudioTranscription({
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
  });
  atcAudioBlobHandlerRef.current = handleAtcAudioBlob;
  const { pilotVoiceStatus } = usePilotVoiceResponse({
    atcConsoleResult,
    pilotVoiceMode,
    playPilotSpeech,
    setAtcConsoleResult
  });

  function togglePilotVoiceMode() {
    if (publicDemoMode) {
      return;
    }

    setPilotVoiceMode((current) => (current === "llm" ? "deterministic" : "llm"));
  }

  function cyclePilotSpeechModeForUi() {
    if (publicDemoMode) {
      return;
    }

    cyclePilotSpeechMode();
  }

  return {
    atcMicLevel,
    atcSpeechStatus,
    cyclePilotSpeechMode: cyclePilotSpeechModeForUi,
    pilotSpeechEnabled,
    pilotSpeechFastMode,
    pilotSpeechStatus,
    pilotVoiceMode,
    pilotVoiceStatus,
    togglePilotVoiceMode,
    togglePushToTalkRecording
  };
}
