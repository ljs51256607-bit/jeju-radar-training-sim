import {
  useEffect,
  useRef,
  type Dispatch,
  type FormEvent,
  type SetStateAction
} from "react";
import {
  confirmCallsignCommandRequestsRepeat,
  parseAtcCommand
} from "../lib/atcCommandParser";
import {
  atcConsoleAppliedDebugText,
  nowForAtcDebugMs,
  type AtcCommandDebugMeta,
  type AtcCommandDebugState,
  type PendingAtcCommandDebug
} from "../lib/atcCommandDebug";
import type { ParsedAtcCommandBatch } from "../lib/atcCommandBatch";
import { prepareAtcCommandText } from "../lib/atcCommandTextRuntime";
import {
  atcCommandKind,
  evaluateAtcCommandBatch
} from "../lib/atcCommandBatchRuntime";
import {
  evaluateReadyAtcSingleCommand,
  resolveAtcSingleCommandTarget
} from "../lib/atcCommandSingleRuntime";
import {
  evaluatePendingAtcConfirmation,
  type PendingAtcConfirmation
} from "../lib/atcPendingConfirmationRuntime";
import {
  normalizeAtcTranscriptForParser,
  type AtcTranscriptNormalizationResult
} from "../lib/atcTranscriptNormalizer";
import type { AtcSttContext } from "../lib/atcSttContext";
import {
  atcConsoleResultFromPilotResponse,
  type AtcConsoleResult
} from "../lib/atcConsoleViewModel";
import {
  aircraftWithOnFrequencyState,
  aircraftWithRadioStandbyState
} from "../lib/aircraftFrequency";
import {
  publishedSpeedRestrictionConflict
} from "../lib/flightProfileGuidance";
import {
  procedureAssignmentControlFormAfterDraft
} from "../lib/procedureAssignmentRuntime";
import { commandActivationTimeMs } from "../lib/simulationTickRuntime";
import { sanitizeCallsignInput } from "../lib/scenarioTraffic";
import {
  pilotResponseForFirstContact,
  pilotResponseForRadioCallsignQuery,
  pilotResponseForSpeedRestrictionConflict
} from "../lib/pilotResponseLayer";
import {
  confirmMostRecentJammedCallsign,
  requestMostRecentJammedCallsignSayAgain,
  requestJammedCallsignSayAgain
} from "../lib/pilotFirstContact";
import type { PttLiveSamplePrompt } from "../lib/pttLiveSampleSession";
import type {
  AircraftControlField,
  AircraftControlForm
} from "../lib/aircraftControlPanel";
import type {
  AircraftState,
  RadarDataset
} from "../lib/types";

interface UseAtcCommandExecutorOptions {
  aircraftTraffic: AircraftState[];
  atcCommandText: string;
  dataset: RadarDataset | null;
  getSimulationNowMs: () => number;
  magneticVariationWestDeg: number;
  pttLiveSamplePrompt: PttLiveSamplePrompt | null;
  recordPttVoiceTrace: (
    debug: AtcCommandDebugState,
    consoleResult: AtcConsoleResult,
    options?: { liveSample?: PttLiveSamplePrompt["current"] }
  ) => void;
  selectedAircraftId: string | null;
  setAircraftTraffic: Dispatch<SetStateAction<AircraftState[]>>;
  setAtcCommandText: Dispatch<SetStateAction<string>>;
  setAtcConsoleResult: Dispatch<SetStateAction<AtcConsoleResult>>;
  setControlError: Dispatch<SetStateAction<string | null>>;
  setControlForm: Dispatch<SetStateAction<AircraftControlForm>>;
  setControlPanelOpen: Dispatch<SetStateAction<boolean>>;
  setLastAtcCommandDebug: Dispatch<SetStateAction<AtcCommandDebugState | null>>;
  setLastCommandSplit: Dispatch<SetStateAction<string[]>>;
  setLastEditedControlField: Dispatch<SetStateAction<AircraftControlField | null>>;
  setLastSttContext: Dispatch<SetStateAction<AtcSttContext | null>>;
  setLastTranscriptNormalization: Dispatch<
    SetStateAction<AtcTranscriptNormalizationResult | null>
  >;
  setSelectedAircraftId: Dispatch<SetStateAction<string | null>>;
}

export function useAtcCommandExecutor({
  aircraftTraffic,
  atcCommandText,
  dataset,
  getSimulationNowMs,
  magneticVariationWestDeg,
  pttLiveSamplePrompt,
  recordPttVoiceTrace,
  selectedAircraftId,
  setAircraftTraffic,
  setAtcCommandText,
  setAtcConsoleResult,
  setControlError,
  setControlForm,
  setControlPanelOpen,
  setLastAtcCommandDebug,
  setLastCommandSplit,
  setLastEditedControlField,
  setLastSttContext,
  setLastTranscriptNormalization,
  setSelectedAircraftId
}: UseAtcCommandExecutorOptions) {
  const pendingAtcConfirmationRef = useRef<PendingAtcConfirmation | null>(null);
  const pendingAtcCommandDebugRef = useRef<PendingAtcCommandDebug | null>(null);
  const speedRestrictionPromptKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!dataset) {
      speedRestrictionPromptKeyRef.current = null;
      return;
    }

    const promptCandidate = aircraftTraffic
      .map((aircraft) => ({
        aircraft,
        conflict: publishedSpeedRestrictionConflict(aircraft, dataset)
      }))
      .find((candidate) => candidate.conflict?.requires_prompt);

    if (!promptCandidate?.conflict) {
      speedRestrictionPromptKeyRef.current = null;
      if (pendingAtcConfirmationRef.current?.kind === "cancel_active_speed_restriction") {
        pendingAtcConfirmationRef.current = null;
      }
      return;
    }

    const { aircraft, conflict } = promptCandidate;
    const promptKey = `${aircraft.id}:${conflict.fix_id}:${conflict.speed_cap_kt}:${conflict.controller_policy_type}:${conflict.controller_speed_kt}`;

    if (speedRestrictionPromptKeyRef.current === promptKey) {
      return;
    }

    speedRestrictionPromptKeyRef.current = promptKey;
    pendingAtcConfirmationRef.current = {
      kind: "cancel_active_speed_restriction",
      aircraftId: aircraft.id,
      callsign: sanitizeCallsignInput(aircraft.callsign),
      fixId: conflict.fix_id,
      readback: `Cancel ${conflict.fix_id} speed restriction, ${sanitizeCallsignInput(aircraft.callsign)}`
    };
    setAtcConsoleResult(
      atcConsoleResultFromPilotResponse(
        pilotResponseForSpeedRestrictionConflict(
          sanitizeCallsignInput(aircraft.callsign),
          `${conflict.fix_id} ${conflict.speed_cap_kt}kt cap in ${conflict.distance_nm.toFixed(1)}NM conflicts with controller ${conflict.controller_policy_type} ${conflict.controller_speed_kt}kt`
        )
      )
    );
  }, [aircraftTraffic, dataset, setAtcConsoleResult]);

  function handleAtcCommandTextChange(value: string) {
    setAtcCommandText(value);
    setLastTranscriptNormalization(null);
    setLastSttContext(null);
    setLastCommandSplit([]);
    setLastAtcCommandDebug(null);
    setAtcConsoleResult((current) =>
      current.status === "idle" ? current : { status: "idle", response: "READY" }
    );
  }

  function handleAtcCommandSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const submittedCommandText = atcCommandTextFromSubmitEvent(event) ?? atcCommandText;
    const pipelineStartedAtMs = nowForAtcDebugMs();
    const normalizeStartedAtMs = nowForAtcDebugMs();
    const normalization = dataset
      ? normalizeAtcTranscriptForParser(submittedCommandText, {
          aircraft: aircraftTraffic,
          dataset
        })
      : null;
    const normalizeMs = nowForAtcDebugMs() - normalizeStartedAtMs;
    const commandText = normalization?.normalized ?? submittedCommandText;

    setLastTranscriptNormalization(normalization);
    setLastSttContext(null);
    setAtcCommandText(commandText);
    applyAtcCommandText(commandText, {
      source: "TEXT",
      raw: submittedCommandText,
      normalized: commandText,
      startedAtMs: pipelineStartedAtMs,
      normalizeMs
    });
  }

  function applyPendingAtcConfirmation(affirmed: boolean) {
    const pending = pendingAtcConfirmationRef.current;
    const evaluation = evaluatePendingAtcConfirmation({
      pending,
      affirmed,
      aircraftTraffic
    });

    if (pending) {
      pendingAtcConfirmationRef.current = null;
    }

    if (evaluation.status === "applied") {
      applyAtcAircraftUpdate(evaluation.aircraftId, () => evaluation.aircraft);
      commitAtcConsoleResult(atcConsoleResultFromPilotResponse(evaluation.response));
      setAtcCommandText("");
      setControlPanelOpen(false);
      setControlError(null);
      return;
    }

    commitAtcConsoleResult(atcConsoleResultFromPilotResponse(evaluation.response));
    setAtcCommandText("");
  }

  function applyAtcCommandBatch(batch: ParsedAtcCommandBatch) {
    if (!dataset) {
      return;
    }

    setLastCommandSplit(batch.commandTexts.map((commandText) => parseAtcCommand(commandText).body));
    pendingAtcConfirmationRef.current = null;

    const evaluation = evaluateAtcCommandBatch({
      batch,
      aircraftTraffic,
      dataset,
      magneticVariationWestDeg,
      activeAtMs: getSimulationNowMs()
    });

    if (evaluation.targetAircraftId) {
      setSelectedAircraftId(evaluation.targetAircraftId);
    }

    if (evaluation.markOnFrequencyAircraftId) {
      markAircraftOnFrequency(evaluation.markOnFrequencyAircraftId);
    }

    if (evaluation.status === "response") {
      commitAtcConsoleResult(atcConsoleResultFromPilotResponse(evaluation.response));
      return;
    }

    applyAtcAircraftUpdate(evaluation.targetAircraftId, () => evaluation.aircraft);

    if (evaluation.targetAircraftId === selectedAircraftId && Object.keys(evaluation.controlUpdates).length > 0) {
      setControlForm((currentForm) => ({
        ...currentForm,
        ...evaluation.controlUpdates
      }));
      setLastEditedControlField(null);
    }

    commitAtcConsoleResult(atcConsoleResultFromPilotResponse(evaluation.response));
    setAtcCommandText("");
    setControlPanelOpen(false);
    setControlError(null);
  }

  function applyAtcCommandText(rawCommand: string, debugMeta?: AtcCommandDebugMeta) {
    if (!dataset) {
      return;
    }

    const preparedCommand = prepareAtcCommandText(rawCommand, debugMeta);
    pendingAtcCommandDebugRef.current = preparedCommand.debugDraft.pending;
    setLastAtcCommandDebug(preparedCommand.debugDraft.visible);

    if (preparedCommand.status === "pending_confirmation") {
      applyPendingAtcConfirmation(preparedCommand.affirmed);
      return;
    }

    if (preparedCommand.status === "batch") {
      applyAtcCommandBatch(preparedCommand.batch);
      return;
    }

    setLastCommandSplit([]);
    pendingAtcConfirmationRef.current = null;
    const parsed = preparedCommand.parsed;

    if (parsed.intent === "CONFIRM_CALLSIGN") {
      const repeatedFirstContact = parsed.callsign
        ? requestJammedCallsignSayAgain(
            aircraftTraffic,
            dataset,
            getSimulationNowMs(),
            parsed.callsign
          )
        : null;

      if (repeatedFirstContact?.status === "repeated") {
        const result = atcConsoleResultFromPilotResponse(
          pilotResponseForFirstContact(
            repeatedFirstContact.event.callsign,
            repeatedFirstContact.event.text,
            repeatedFirstContact.event.detail
          )
        );
        setAircraftTraffic(repeatedFirstContact.aircraftTraffic);
        setSelectedAircraftId(repeatedFirstContact.event.aircraftId);
        commitAtcConsoleResult(result);
        setAtcCommandText("");
        return;
      }

      const genericRepeatedFirstContact =
        !parsed.callsign && confirmCallsignCommandRequestsRepeat(parsed)
          ? requestMostRecentJammedCallsignSayAgain(
              aircraftTraffic,
              dataset,
              getSimulationNowMs()
            )
          : null;

      if (genericRepeatedFirstContact?.status === "repeated") {
        const result = atcConsoleResultFromPilotResponse(
          pilotResponseForFirstContact(
            genericRepeatedFirstContact.event.callsign,
            genericRepeatedFirstContact.event.text,
            genericRepeatedFirstContact.event.detail
          )
        );
        setAircraftTraffic(genericRepeatedFirstContact.aircraftTraffic);
        setSelectedAircraftId(genericRepeatedFirstContact.event.aircraftId);
        commitAtcConsoleResult(result);
        setAtcCommandText("");
        return;
      }

      const confirmation = parsed.callsign
        ? { status: "none" as const, aircraftTraffic }
        : confirmMostRecentJammedCallsign(
            aircraftTraffic,
            getSimulationNowMs()
          );

      if (confirmation.status === "confirmed") {
        const result = atcConsoleResultFromPilotResponse(
          pilotResponseForRadioCallsignQuery(confirmation.callsign, confirmation.detail)
        );
        setAircraftTraffic(confirmation.aircraftTraffic);
        setSelectedAircraftId(confirmation.aircraftId);
        commitAtcConsoleResult(result);
        setAtcCommandText("");
        return;
      }
    }

    const targetResolution = resolveAtcSingleCommandTarget({
      parsed,
      aircraftTraffic
    });

    if (targetResolution.targetAircraftId) {
      setSelectedAircraftId(targetResolution.targetAircraftId);
    }

    if (targetResolution.markOnFrequencyAircraftId) {
      markAircraftOnFrequency(targetResolution.markOnFrequencyAircraftId, parsed.intent);
    }

    if (targetResolution.status === "response") {
      commitAtcConsoleResult(atcConsoleResultFromPilotResponse(targetResolution.response));
      return;
    }

    const targetAircraft = targetResolution.targetAircraft;
    const commandActiveAtMs = commandActivationTimeMs(
      dataset,
      atcCommandKind(parsed),
      getSimulationNowMs()
    );
    const readyEvaluation = evaluateReadyAtcSingleCommand({
      parsed,
      targetAircraft,
      dataset,
      magneticVariationWestDeg,
      commandActiveAtMs,
      issuedAtMs: getSimulationNowMs()
    });

    if (readyEvaluation.status === "response") {
      if (readyEvaluation.pendingConfirmation) {
        pendingAtcConfirmationRef.current = readyEvaluation.pendingConfirmation;
      }
      if (readyEvaluation.controlErrorMessage) {
        setControlError(readyEvaluation.controlErrorMessage);
      }
      commitAtcConsoleResult(atcConsoleResultFromPilotResponse(readyEvaluation.response));
      if (readyEvaluation.response.payload.condition === "READBACK_ONLY_COMMAND") {
        setAtcCommandText("");
        setControlPanelOpen(false);
        setControlError(null);
      }
      return;
    }

    applyAtcAircraftUpdate(targetAircraft.id, () => readyEvaluation.aircraft);
    if (readyEvaluation.controlUpdates && Object.keys(readyEvaluation.controlUpdates).length > 0) {
      syncSelectedControlFormAfterAtc(targetAircraft, readyEvaluation.controlUpdates);
    }
    if (readyEvaluation.procedureDraft) {
      setSelectedAircraftId(targetAircraft.id);
      setControlForm((currentForm) =>
        procedureAssignmentControlFormAfterDraft(
          currentForm,
          targetAircraft,
          readyEvaluation.procedureDraft!,
          magneticVariationWestDeg
        )
      );
      setLastEditedControlField(null);
    }
    commitAtcConsoleResult(atcConsoleResultFromPilotResponse(readyEvaluation.response));
    setAtcCommandText("");
    setControlPanelOpen(false);
    setControlError(null);
  }

  function commitAtcConsoleResult(result: AtcConsoleResult) {
    setAtcConsoleResult(result);
    finalizePendingAtcCommandDebug(result);
  }

  function finalizePendingAtcCommandDebug(result: AtcConsoleResult) {
    const pendingDebug = pendingAtcCommandDebugRef.current;

    if (!pendingDebug) {
      return;
    }

    pendingAtcCommandDebugRef.current = null;
    const nowMs = nowForAtcDebugMs();
    const finalizedDebug: AtcCommandDebugState = {
      source: pendingDebug.source,
      raw: pendingDebug.raw,
      normalized: pendingDebug.normalized,
      parsed: pendingDebug.parsed,
      applied: atcConsoleAppliedDebugText(result),
      latency: {
        ...pendingDebug.latency,
        apply_ms: nowMs - pendingDebug.applyStartedAtMs,
        total_ms: nowMs - pendingDebug.startedAtMs
      }
    };

    setLastAtcCommandDebug(finalizedDebug);

    if (finalizedDebug.source === "VOICE") {
      recordPttVoiceTrace(finalizedDebug, result, {
        liveSample: pttLiveSamplePrompt?.current ?? null
      });
    }
  }

  function applyAtcAircraftUpdate(
    aircraftId: string,
    updater: (aircraft: AircraftState) => AircraftState
  ) {
    setAircraftTraffic((currentAircraft) =>
      currentAircraft.map((aircraft) =>
        aircraft.id === aircraftId ? aircraftWithOnFrequencyState(updater(aircraft)) : aircraft
      )
    );
  }

  function markAircraftOnFrequency(aircraftId: string, intent?: string | null) {
    const standbyAtMs = intent === "RADIO_STANDBY" ? getSimulationNowMs() : undefined;

    setAircraftTraffic((currentAircraft) =>
      currentAircraft.map((aircraft) =>
        aircraft.id === aircraftId
          ? intent === "RADIO_STANDBY"
            ? aircraftWithRadioStandbyState(aircraft, standbyAtMs)
            : aircraftWithOnFrequencyState(aircraft)
          : aircraft
      )
    );
  }

  function syncSelectedControlFormAfterAtc(
    targetAircraft: AircraftState,
    updates: Partial<AircraftControlForm>
  ) {
    if (targetAircraft.id !== selectedAircraftId) {
      return;
    }

    setControlForm((currentForm) => ({
      ...currentForm,
      ...updates
    }));
    setLastEditedControlField(null);
  }

  return {
    applyAtcCommandText,
    handleAtcCommandSubmit,
    handleAtcCommandTextChange
  };
}

function atcCommandTextFromSubmitEvent(event: FormEvent<HTMLFormElement>) {
  const input = event.currentTarget.querySelector<HTMLInputElement>(
    '[data-testid="atc-command-input"]'
  );
  const value = input?.value;

  return typeof value === "string" ? value : null;
}
