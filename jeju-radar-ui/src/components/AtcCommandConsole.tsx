import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  Ref
} from "react";
import {
  atcLatencyDebugText,
  type AtcCommandDebugState
} from "../lib/atcCommandDebug";
import type { AtcSpeechStatus } from "../lib/atcSpeechClient";
import type {
  AtcConsoleResult,
  PilotVoiceUiStatus
} from "../lib/atcConsoleViewModel";
import {
  radioExchangePhaseBlocksPilotFirstContact,
  radioExchangePhaseLabel
} from "../lib/atcConsoleViewModel";
import type { AtcTranscriptNormalizationResult } from "../lib/atcTranscriptNormalizer";
import type { PilotVoiceMode } from "../lib/pilotVoiceClient";
import type { PttLiveSamplePrompt } from "../lib/pttLiveSampleSession";
import { pttLiveSessionViewModel } from "../lib/pttLiveSessionViewModel";
import type {
  PttVoiceTraceEntry,
  PttVoiceTraceLabel,
  PttVoiceTraceSummary
} from "../lib/pttVoiceTrace";
import {
  radioQueueActionLabel,
  radioQueueActionsForRow,
  type RadioQueueAction,
  type RadioQueueRow
} from "../lib/radioQueueViewModel";

interface AtcSpeechUiStatus {
  state: AtcSpeechStatus;
  detail: string;
  text?: string;
}

interface PilotSpeechUiStatus {
  state: "ready" | "speaking" | "error" | "muted";
  detail: string;
  voice?: string | null;
}

export interface AtcCommandConsoleProps {
  atcCommandText: string;
  atcConsoleResult: AtcConsoleResult;
  atcSpeechStatus: AtcSpeechUiStatus;
  inputRef?: Ref<HTMLInputElement>;
  lastAtcCommandDebug: AtcCommandDebugState | null;
  lastCommandSplit: string[];
  lastSttContextDisplay: string | null;
  lastTranscriptNormalization: AtcTranscriptNormalizationResult | null;
  latestPttVoiceTrace: PttVoiceTraceEntry | null;
  onCommandInputKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onCommandTextChange: (value: string) => void;
  onCyclePilotSpeechMode: () => void;
  onClearPttTraces: () => void;
  onExportPttTraces: () => void;
  onLabelPttTrace: (label: PttVoiceTraceLabel) => void;
  onRadioQueueAction?: (callsign: string, action: RadioQueueAction) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTogglePilotVoiceMode: () => void;
  onTogglePushToTalkRecording: () => void;
  pilotSpeechEnabled: boolean;
  pilotSpeechFastMode: boolean;
  pilotSpeechStatus: PilotSpeechUiStatus;
  pilotVoiceMode: PilotVoiceMode;
  pilotVoiceStatus: PilotVoiceUiStatus;
  publicDemoMode?: boolean;
  pttLiveSamplePrompt: PttLiveSamplePrompt | null;
  pttTraceExportStatus: string | null;
  pttVoiceTraceSummary: PttVoiceTraceSummary;
  radioQueueRows?: RadioQueueRow[];
}

export default function AtcCommandConsole({
  atcCommandText,
  atcConsoleResult,
  atcSpeechStatus,
  inputRef,
  lastAtcCommandDebug,
  lastCommandSplit,
  lastSttContextDisplay,
  lastTranscriptNormalization,
  latestPttVoiceTrace,
  onCommandInputKeyDown,
  onCommandTextChange,
  onCyclePilotSpeechMode,
  onClearPttTraces,
  onExportPttTraces,
  onLabelPttTrace,
  onRadioQueueAction,
  onSubmit,
  onTogglePilotVoiceMode,
  onTogglePushToTalkRecording,
  pilotSpeechEnabled,
  pilotSpeechFastMode,
  pilotSpeechStatus,
  pilotVoiceMode,
  pilotVoiceStatus,
  publicDemoMode = false,
  pttLiveSamplePrompt,
  pttTraceExportStatus,
  pttVoiceTraceSummary,
  radioQueueRows = []
}: AtcCommandConsoleProps) {
  const liveSession = pttLiveSessionViewModel(pttVoiceTraceSummary);
  const radioExchangeText = radioExchangePhaseLabel(atcConsoleResult.radio_exchange_phase);
  const radioQueueActionsDisabled = radioExchangePhaseBlocksPilotFirstContact(
    atcConsoleResult.radio_exchange_phase
  );

  return (
    <form className="atc-command-console" data-testid="atc-command-console" onSubmit={onSubmit}>
      <label>
        ATC
        <input
          aria-label="ATC command"
          data-testid="atc-command-input"
          placeholder="CALLSIGN speed 180"
          ref={inputRef}
          value={atcCommandText}
          onChange={(event) => onCommandTextChange(event.target.value)}
          onKeyDown={onCommandInputKeyDown}
        />
      </label>
      <button data-testid="atc-command-submit" type="submit">
        SEND
      </button>
      <button
        className={`atc-ptt-toggle ${atcSpeechStatus.state}`}
        data-testid="atc-ptt-toggle"
        disabled={publicDemoMode}
        onClick={onTogglePushToTalkRecording}
        title={publicDemoMode ? "Public demo uses text commands only" : "Hold Ctrl, or click to start/stop push-to-talk"}
        type="button"
      >
        {atcSpeechStatus.state === "recording" ? "REC" : "PTT"}
      </button>
      <button
        className={pilotVoiceMode === "llm" ? "pilot-voice-toggle active" : "pilot-voice-toggle"}
        data-testid="pilot-voice-toggle"
        disabled={publicDemoMode}
        onClick={onTogglePilotVoiceMode}
        title={publicDemoMode ? "Public demo uses deterministic pilot responses only" : "Pilot readback voice mode"}
        type="button"
      >
        {pilotVoiceMode === "llm" ? "LLM" : "DET"}
      </button>
      <button
        className={pilotSpeechEnabled ? "pilot-speech-toggle active" : "pilot-speech-toggle"}
        data-testid="pilot-speech-toggle"
        disabled={publicDemoMode}
        onClick={onCyclePilotSpeechMode}
        title={publicDemoMode ? "Public demo does not call speech services" : "Pilot speech playback: FAST local, SPK OpenAI, MUTE off"}
        type="button"
      >
        {!pilotSpeechEnabled ? "MUTE" : pilotSpeechFastMode ? "FAST" : "SPK"}
      </button>
      <div className={`atc-command-result ${atcConsoleResult.status}`} data-testid="atc-command-result">
        <strong>{atcConsoleResult.response}</strong>
        {atcConsoleResult.detail ? <span>{atcConsoleResult.detail}</span> : null}
        <span className={`atc-speech-status ${atcSpeechStatus.state}`}>
          MIC {atcSpeechStatus.detail}
          {atcSpeechStatus.text ? ` ${atcSpeechStatus.text}` : ""}
        </span>
        {publicDemoMode ? (
          <span className="atc-normalization-status hint">STATIC DEMO TEXT COMMANDS ONLY</span>
        ) : null}
        {lastSttContextDisplay ? (
          <span className="atc-normalization-status hint">HINT {lastSttContextDisplay}</span>
        ) : null}
        {radioExchangeText ? (
          <span className={`atc-normalization-status radio-flow ${atcConsoleResult.radio_exchange_phase}`}>
            RADIO {radioExchangeText}
          </span>
        ) : null}
        {lastCommandSplit.length > 0 ? (
          <span className="atc-normalization-status split">
            CMDS {lastCommandSplit.join(" / ")}
          </span>
        ) : null}
        {lastTranscriptNormalization ? (
          <>
            <span className="atc-normalization-status raw">
              RAW {lastTranscriptNormalization.raw}
            </span>
            <span
              className={
                lastTranscriptNormalization.changed
                  ? "atc-normalization-status changed"
                  : "atc-normalization-status"
              }
            >
              NORM {lastTranscriptNormalization.normalized}
            </span>
            {lastTranscriptNormalization.reasons.length > 0 ||
            lastTranscriptNormalization.warnings.length > 0 ? (
              <span className="atc-normalization-status reason">
                WHY{" "}
                {[
                  ...lastTranscriptNormalization.reasons,
                  ...lastTranscriptNormalization.warnings
                ].join(" / ")}
              </span>
            ) : null}
          </>
        ) : null}
        {lastAtcCommandDebug ? (
          <>
            <span className="atc-normalization-status parsed">
              PARSED {lastAtcCommandDebug.parsed}
            </span>
            <span className={`atc-normalization-status applied ${atcConsoleResult.status}`}>
              APPLIED {lastAtcCommandDebug.applied}
            </span>
            <span className="atc-normalization-status latency">
              LAT {atcLatencyDebugText(lastAtcCommandDebug.latency)}
            </span>
          </>
        ) : null}
        {pilotVoiceMode === "llm" ? (
          <span className={`pilot-voice-status ${pilotVoiceStatus.state}`}>
            VOICE {pilotVoiceStatus.detail}
            {pilotVoiceStatus.model ? ` ${pilotVoiceStatus.model}` : ""}
          </span>
        ) : null}
        <span className={`pilot-speech-status ${pilotSpeechStatus.state}`}>
          SPK {pilotSpeechStatus.detail}
          {pilotSpeechStatus.voice ? ` ${pilotSpeechStatus.voice}` : ""}
        </span>
        {radioQueueRows.length > 0 ? (
          <div
            aria-label="Radio queue"
            className="radio-queue-panel"
            data-testid="radio-queue-list"
          >
            <span className="radio-queue-title">RADIO Q</span>
            {radioQueueRows.map((row) => (
              <span
                aria-label={`${row.status} ${row.callsign} ${row.detail}`}
                className={`radio-queue-chip ${row.status.toLowerCase()}`}
                data-radio-queue-callsign={row.callsign}
                data-radio-queue-status={row.status}
                key={row.aircraftId}
              >
                <strong>{row.status}</strong>
                <span>{row.callsign}</span>
                <em>{row.detail}</em>
                {radioQueueActionsForRow(row).map((action) => (
                  <button
                    aria-label={`${row.callsign} ${radioQueueActionLabel(action)}`}
                    data-radio-queue-action={action}
                    disabled={radioQueueActionsDisabled}
                    key={action}
                    onClick={() => onRadioQueueAction?.(row.callsign, action)}
                    type="button"
                  >
                    {radioQueueActionLabel(action)}
                  </button>
                ))}
              </span>
            ))}
          </div>
        ) : null}
        <div className="ptt-trace-panel">
          <div className={`ptt-live-session ${liveSession.state}`}>
            <span>{liveSession.progressText}</span>
            <span>{liveSession.labelText}</span>
            <span>{liveSession.actionText}</span>
            <span>{liveSession.qualityText}</span>
          </div>
          {pttLiveSamplePrompt?.current ? (
            <div className="ptt-live-sample-prompt">
              <span>{pttLiveSamplePrompt.progressText}</span>
              <strong>{pttLiveSamplePrompt.current.phrase}</strong>
              {pttLiveSamplePrompt.focusText ? <span>{pttLiveSamplePrompt.focusText}</span> : null}
            </div>
          ) : null}
          <span className="ptt-trace-summary">
            TRACE {pttVoiceTraceSummary.total} / GOOD {pttVoiceTraceSummary.good} / FAIL{" "}
            {pttVoiceTraceSummary.fail}
            {pttVoiceTraceSummary.error > 0 ? ` / ERR ${pttVoiceTraceSummary.error}` : ""}
            {pttVoiceTraceSummary.avg_total_latency_ms !== null
              ? ` / AVG ${pttVoiceTraceSummary.avg_total_latency_ms}ms`
              : ""}
            {pttTraceExportStatus ? ` / ${pttTraceExportStatus}` : ""}
          </span>
          {latestPttVoiceTrace ? (
            <span className={`ptt-trace-latest ${latestPttVoiceTrace.result}`}>
              LAST {latestPttVoiceTrace.result.toUpperCase()}
              {latestPttVoiceTrace.label ? ` / ${latestPttVoiceTrace.label}` : ""}
            </span>
          ) : null}
          <div className="ptt-trace-actions">
            {(["GOOD", "STT_FAIL", "WRONG_CALLSIGN", "WRONG_NUMBER", "WRONG_FIX", "PARSER_FAIL", "UNNECESSARY_SAY_AGAIN"] as PttVoiceTraceLabel[]).map((label) => (
              <button
                disabled={!latestPttVoiceTrace}
                key={label}
                onClick={() => onLabelPttTrace(label)}
                type="button"
              >
                {label.replace(/_/g, " ")}
              </button>
            ))}
            <button disabled={pttVoiceTraceSummary.total === 0} onClick={onExportPttTraces} type="button">
              EXPORT TRACE
            </button>
            <button disabled={pttVoiceTraceSummary.total === 0} onClick={onClearPttTraces} type="button">
              CLEAR
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
