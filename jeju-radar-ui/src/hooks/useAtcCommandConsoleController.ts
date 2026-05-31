import {
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import type { AtcCommandDebugState } from "../lib/atcCommandDebug";
import {
  type AtcConsoleResult
} from "../lib/atcConsoleViewModel";
import type { AtcSttContext } from "../lib/atcSttContext";
import type { AtcTranscriptNormalizationResult } from "../lib/atcTranscriptNormalizer";
import type {
  AircraftControlField,
  AircraftControlForm
} from "../lib/aircraftControlPanel";
import { pttLiveSamplePromptForTraceCount } from "../lib/pttLiveSampleSession";
import type {
  AircraftState,
  RadarDataset
} from "../lib/types";
import { useAtcCommandExecutor } from "./useAtcCommandExecutor";
import { usePttLiveSampleSession } from "./usePttLiveSampleSession";
import { usePttVoiceTraceStore } from "./usePttVoiceTraceStore";

interface UseAtcCommandConsoleControllerOptions {
  aircraftTraffic: AircraftState[];
  dataset: RadarDataset | null;
  getSimulationNowMs: () => number;
  magneticVariationWestDeg: number;
  selectedAircraftId: string | null;
  setAircraftTraffic: Dispatch<SetStateAction<AircraftState[]>>;
  setControlError: Dispatch<SetStateAction<string | null>>;
  setControlForm: Dispatch<SetStateAction<AircraftControlForm>>;
  setControlPanelOpen: Dispatch<SetStateAction<boolean>>;
  setLastEditedControlField: Dispatch<SetStateAction<AircraftControlField | null>>;
  setSelectedAircraftId: Dispatch<SetStateAction<string | null>>;
}

export function useAtcCommandConsoleController({
  aircraftTraffic,
  dataset,
  getSimulationNowMs,
  magneticVariationWestDeg,
  selectedAircraftId,
  setAircraftTraffic,
  setControlError,
  setControlForm,
  setControlPanelOpen,
  setLastEditedControlField,
  setSelectedAircraftId
}: UseAtcCommandConsoleControllerOptions) {
  const [atcCommandText, setAtcCommandText] = useState("");
  const [lastTranscriptNormalization, setLastTranscriptNormalization] =
    useState<AtcTranscriptNormalizationResult | null>(null);
  const [lastSttContext, setLastSttContext] = useState<AtcSttContext | null>(null);
  const [lastCommandSplit, setLastCommandSplit] = useState<string[]>([]);
  const [lastAtcCommandDebug, setLastAtcCommandDebug] =
    useState<AtcCommandDebugState | null>(null);
  const [atcConsoleResult, setAtcConsoleResult] = useState<AtcConsoleResult>({
    status: "idle",
    response: "READY"
  });
  const {
    clearStoredPttVoiceTraces,
    exportPttVoiceTraceJson,
    labelLatestPttVoiceTrace,
    latestPttVoiceTrace,
    pttTraceExportStatus,
    pttVoiceTraceSummary,
    recordPttVoiceTrace
  } = usePttVoiceTraceStore({
    lastTranscriptNormalization,
    sttContextDisplay: lastSttContext?.display ?? null
  });
  const pttLiveSampleSession = usePttLiveSampleSession();
  const pttLiveSamplePrompt = useMemo(
    () => pttLiveSamplePromptForTraceCount(pttLiveSampleSession, pttVoiceTraceSummary.total),
    [pttLiveSampleSession, pttVoiceTraceSummary.total]
  );
  const {
    applyAtcCommandText,
    handleAtcCommandSubmit,
    handleAtcCommandTextChange
  } = useAtcCommandExecutor({
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
  });

  return {
    applyAtcCommandText,
    atcCommandText,
    atcConsoleResult,
    clearStoredPttVoiceTraces,
    exportPttVoiceTraceJson,
    handleAtcCommandSubmit,
    handleAtcCommandTextChange,
    labelLatestPttVoiceTrace,
    lastAtcCommandDebug,
    lastCommandSplit,
    lastSttContext,
    lastTranscriptNormalization,
    latestPttVoiceTrace,
    pttLiveSamplePrompt,
    pttTraceExportStatus,
    pttVoiceTraceSummary,
    recordPttVoiceTrace,
    setAtcCommandText,
    setAtcConsoleResult,
    setLastAtcCommandDebug,
    setLastSttContext,
    setLastTranscriptNormalization
  };
}
