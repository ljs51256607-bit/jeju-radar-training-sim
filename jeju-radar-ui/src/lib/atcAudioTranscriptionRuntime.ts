import {
  nowForAtcDebugMs,
  type AtcCommandDebugMeta,
  type AtcCommandDebugState
} from "./atcCommandDebug";
import type { AtcConsoleResult } from "./atcConsoleViewModel";
import { type AtcSpeechStatus, transcribeAtcAudio } from "./atcSpeechClient";
import { buildAtcSttContext, type AtcSttContext } from "./atcSttContext";
import {
  normalizeAtcTranscriptForParser,
  type AtcTranscriptNormalizationResult
} from "./atcTranscriptNormalizer";
import type { PttLiveSample } from "./pttLiveSampleSession";
import type { PttVoiceTraceLabel } from "./pttVoiceTrace";
import type { AircraftState, RadarDataset, RunwayMode } from "./types";

export interface AtcSpeechStatusUpdate {
  state: AtcSpeechStatus;
  detail: string;
  text?: string;
  model?: string;
}

interface RecordPttVoiceTraceOptions {
  label?: PttVoiceTraceLabel;
  liveSample?: PttLiveSample | null;
  normalization?: AtcTranscriptNormalizationResult | null;
  sttContextDisplay?: string | null;
}

export interface RunAtcAudioTranscriptionArgs {
  aircraftTraffic: AircraftState[];
  applyAtcCommandText: (rawCommand: string, debugMeta?: AtcCommandDebugMeta) => void;
  audioBlob: Blob;
  dataset: RadarDataset | null;
  isCurrentRequest: () => boolean;
  liveSample?: PttLiveSample | null;
  nowMs?: () => number;
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
  transcribeAudio?: typeof transcribeAtcAudio;
}

export function atcAudioTranscriptionRequestKey(audioBlob: Blob, nowMs: () => number = Date.now) {
  return `${nowMs()}:${audioBlob.size}`;
}

export async function runAtcAudioTranscription({
  aircraftTraffic,
  applyAtcCommandText,
  audioBlob,
  dataset,
  isCurrentRequest,
  liveSample,
  nowMs = nowForAtcDebugMs,
  recordPttVoiceTrace,
  selectedRunway,
  setAtcCommandText,
  setAtcConsoleResult,
  setAtcSpeechStatus,
  setLastAtcCommandDebug,
  setLastSttContext,
  setLastTranscriptNormalization,
  transcribeAudio = transcribeAtcAudio
}: RunAtcAudioTranscriptionArgs) {
  if (audioBlob.size < 200) {
    setAtcSpeechStatus({ state: "idle", detail: "CTRL PTT" });
    return;
  }

  const pipelineStartedAtMs = nowMs();
  setAtcSpeechStatus({ state: "transcribing", detail: "STT" });
  let traceSttContextDisplay: string | null = null;

  try {
    const sttContext = dataset
      ? buildAtcSttContext({
          aircraft: aircraftTraffic,
          dataset,
          selectedRunway
        })
      : null;
    traceSttContextDisplay = sttContext?.display ?? null;
    setLastSttContext(sttContext);

    const sttStartedAtMs = nowMs();
    const transcription = await transcribeAudio(audioBlob, {
      contextPrompt: sttContext?.prompt
    });
    const sttMs = nowMs() - sttStartedAtMs;

    if (!isCurrentRequest()) {
      return;
    }

    if (!transcription.ok || !transcription.text) {
      recordSttFailure({
        detail: transcription.detail ?? "STT ERROR",
        model: transcription.model,
        nowMs,
        parsed: "NO TRANSCRIPT",
        pipelineStartedAtMs,
        rawText: transcription.text,
        recordPttVoiceTrace,
        setAtcConsoleResult,
        setAtcSpeechStatus,
        setLastAtcCommandDebug,
        liveSample,
        sttContextDisplay: traceSttContextDisplay,
        sttMs
      });
      return;
    }

    const normalizeStartedAtMs = nowMs();
    const normalization = dataset
      ? normalizeAtcTranscriptForParser(transcription.text, {
          aircraft: aircraftTraffic,
          dataset
        })
      : null;
    const normalizeMs = nowMs() - normalizeStartedAtMs;
    const commandText = normalization?.normalized ?? transcription.text;

    setLastTranscriptNormalization(normalization);
    setAtcCommandText(commandText);
    setAtcSpeechStatus({
      state: "applied",
      detail: "APPLIED",
      text: commandText,
      model: transcription.model
    });
    applyAtcCommandText(commandText, {
      source: "VOICE",
      raw: transcription.text,
      normalized: commandText,
      startedAtMs: pipelineStartedAtMs,
      sttMs,
      normalizeMs
    });
  } catch (transcriptionError) {
    recordSttFailure({
      detail: transcriptionError instanceof Error ? transcriptionError.message : "STT ERROR",
      nowMs,
      parsed: "STT EXCEPTION",
      pipelineStartedAtMs,
      rawText: "",
      recordPttVoiceTrace,
      setAtcConsoleResult,
      setAtcSpeechStatus,
      setLastAtcCommandDebug,
      liveSample,
      sttContextDisplay: traceSttContextDisplay
    });
  }
}

interface RecordSttFailureArgs {
  detail: string;
  model?: string;
  nowMs: () => number;
  parsed: "NO TRANSCRIPT" | "STT EXCEPTION";
  pipelineStartedAtMs: number;
  rawText: string;
  recordPttVoiceTrace: RunAtcAudioTranscriptionArgs["recordPttVoiceTrace"];
  setAtcConsoleResult: (result: AtcConsoleResult) => void;
  setAtcSpeechStatus: (status: AtcSpeechStatusUpdate) => void;
  setLastAtcCommandDebug: (debug: AtcCommandDebugState | null) => void;
  liveSample?: PttLiveSample | null;
  sttContextDisplay: string | null;
  sttMs?: number;
}

function recordSttFailure({
  detail,
  model,
  nowMs,
  parsed,
  pipelineStartedAtMs,
  rawText,
  recordPttVoiceTrace,
  setAtcConsoleResult,
  setAtcSpeechStatus,
  setLastAtcCommandDebug,
  liveSample,
  sttContextDisplay,
  sttMs
}: RecordSttFailureArgs) {
  const now = nowMs();
  const failureDebug: AtcCommandDebugState = {
    source: "VOICE",
    raw: rawText,
    normalized: rawText,
    parsed,
    applied: `ERROR - ${detail}`,
    latency: {
      ...(sttMs !== undefined ? { stt_ms: sttMs } : {}),
      total_ms: now - pipelineStartedAtMs
    }
  };
  const failureConsoleResult: AtcConsoleResult = {
    status: "error",
    response: "STT ERROR",
    detail
  };

  setLastAtcCommandDebug(failureDebug);
  setAtcConsoleResult(failureConsoleResult);
  recordPttVoiceTrace(failureDebug, failureConsoleResult, {
    label: "STT_FAIL",
    liveSample,
    normalization: null,
    sttContextDisplay
  });
  setAtcSpeechStatus({
    state: "error",
    detail,
    model
  });
}
