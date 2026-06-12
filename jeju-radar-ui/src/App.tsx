import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from "react";
import type { AtcCommandConsoleProps } from "./components/AtcCommandConsole";
import AtcMicrophoneHud from "./components/AtcMicrophoneHud";
import {
  altitudePresetDatalistId,
  altitudePresetOptions
} from "./components/AltitudePresetInput";
import ScopeOverlayControls from "./components/ScopeOverlayControls";
import RadarMap from "./components/RadarMap";
import ScopeCommandStrip from "./components/ScopeCommandStrip";
import ScopeFloatingControls from "./components/ScopeFloatingControls";
import ScenarioSidePanels from "./components/ScenarioSidePanels";
import SelectedAircraftControlPanel from "./components/SelectedAircraftControlPanel";
import { useAtcCommandConsoleController } from "./hooks/useAtcCommandConsoleController";
import { useAtcVoiceBridge } from "./hooks/useAtcVoiceBridge";
import { useAircraftControlCommandController } from "./hooks/useAircraftControlCommandController";
import { useAircraftCreateController } from "./hooks/useAircraftCreateController";
import { useAircraftDeleteController } from "./hooks/useAircraftDeleteController";
import { useAircraftProcedureActionController } from "./hooks/useAircraftProcedureActionController";
import { useAircraftScratchpadTextController } from "./hooks/useAircraftScratchpadTextController";
import { useAircraftSelectionController } from "./hooks/useAircraftSelectionController";
import { useFixSpawnPickController } from "./hooks/useFixSpawnPickController";
import { useMissedApproachController } from "./hooks/useMissedApproachController";
import { usePilotFirstContactMonitor } from "./hooks/usePilotFirstContactMonitor";
import { useScenarioSnapshotController } from "./hooks/useScenarioSnapshotController";
import { useScenarioStorage } from "./hooks/useScenarioStorage";
import { useScenarioStreamController } from "./hooks/useScenarioStreamController";
import { useRadarDatasetLoader } from "./hooks/useRadarDatasetLoader";
import { useRadarSimulationTick } from "./hooks/useRadarSimulationTick";
import { useRunwaySelectedAircraftGuard } from "./hooks/useRunwaySelectedAircraftGuard";
import { useScopeKeyboardShortcuts } from "./hooks/useScopeKeyboardShortcuts";
import { useScopeOverlayController } from "./hooks/useScopeOverlayController";
import { useScopePanelToggles } from "./hooks/useScopePanelToggles";
import { useSelectedAircraftControlFormSync } from "./hooks/useSelectedAircraftControlFormSync";
import { useSelectedAircraftDeleteHotkey } from "./hooks/useSelectedAircraftDeleteHotkey";
import { useWindSettingsController } from "./hooks/useWindSettingsController";
import {
  aircraftControlFormFromState,
  parseMagneticVariationWestDeg,
  type AircraftControlField,
  type AircraftControlForm
} from "./lib/aircraftControlPanel";
import { buildAircraftCreateDraft } from "./lib/aircraftCreateDraft";
import type {
  AircraftState,
  DensityMode,
  RadarDataset,
  RunwayMode,
  SurfaceMode
} from "./lib/types";
import type { SimulationSpeed } from "./lib/scenarioStorage";
import {
  COMPACT_SCOPE_OVERLAY_KEYS,
  SCOPE_OVERLAY_LABELS,
  SUPPORT_SCOPE_OVERLAY_KEYS
} from "./lib/scopeViewModel";
import { formatRadarTickInterval } from "./lib/simulationTickRuntime";
import { appScopeViewModel } from "./lib/appScopeViewModel";
import {
  commandHistoryAfterSubmit,
  commandHistoryFromStorage,
  saveCommandHistoryToStorage,
  commandHistoryStep
} from "./lib/commandHistory";
import { radioExchangePhaseBlocksPilotFirstContact } from "./lib/atcConsoleViewModel";
import {
  radioQueueActionCommandText,
  radioQueueSelectedActionCommandText,
  radioQueueRows,
  type RadioQueueAction
} from "./lib/radioQueueViewModel";

const PUBLIC_DEMO_MODE = import.meta.env.VITE_PUBLIC_DEMO === "true";

function DemoSafetyCopy() {
  return (
    <p className="demo-safety-copy">
      Training-only simulator. Not for operational ATC, navigation, dispatch, certification, or
      safety-critical use.
    </p>
  );
}

export default function App() {
  const simulationTimeRef = useRef(Date.now());
  const atcCommandInputRef = useRef<HTMLInputElement | null>(null);
  const atcCommandHistoryDraftRef = useRef("");
  const closeScenarioStoragePanelRef = useRef<() => void>(() => {});
  const [dataset, setDataset] = useState<RadarDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRunway, setSelectedRunway] = useState<RunwayMode>("07");
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>("exact");
  const [densityMode, setDensityMode] = useState<DensityMode>("balanced");
  const {
    handleToggleOverlay,
    overlays,
    setOverlays
  } = useScopeOverlayController();
  const [selectedAircraftId, setSelectedAircraftId] = useState<string | null>(null);
  const [showChrome, setShowChrome] = useState(false);
  const [aircraftTraffic, setAircraftTraffic] = useState<AircraftState[]>([]);
  const [radarPaused, setRadarPaused] = useState(false);
  const [simulationSpeed, setSimulationSpeed] = useState<SimulationSpeed>(1);
  const [lastRadarUpdateAt, setLastRadarUpdateAt] = useState<number | null>(null);
  const [controlPanelOpen, setControlPanelOpen] = useState(false);
  const [controlForm, setControlForm] = useState<AircraftControlForm>({
    heading: "",
    speed: "",
    altitude: "",
    verticalRate: "",
    scratchpad: ""
  });
  const [controlError, setControlError] = useState<string | null>(null);
  const [lastEditedControlField, setLastEditedControlField] = useState<AircraftControlField | null>(null);
  const [atcCommandHistory, setAtcCommandHistory] = useState<string[]>(() =>
    commandHistoryFromStorage()
  );
  const [atcCommandHistoryCursor, setAtcCommandHistoryCursor] = useState<number | null>(null);
  const magneticVariationWestDeg = dataset
    ? parseMagneticVariationWestDeg(dataset.airport.airport_meta.mag_var)
    : 0;
  const {
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
  } = useAtcCommandConsoleController({
    aircraftTraffic,
    dataset,
    getSimulationNowMs: simulationNowMs,
    magneticVariationWestDeg,
    selectedAircraftId,
    setAircraftTraffic,
    setControlError,
    setControlForm,
    setControlPanelOpen,
    setLastEditedControlField,
    setSelectedAircraftId
  });
  const {
    applyExpediteDescentCommand,
    applyResumeNormalCommand,
    applyVerticalProcedureModeCommand,
    handleAircraftControlPanelKeyDown,
    handleAircraftControlPanelSubmit,
    handleAircraftQuickCommand,
    handleControlFormChange
  } = useAircraftControlCommandController({
    aircraftTraffic,
    controlForm,
    dataset,
    getSimulationNowMs: simulationNowMs,
    lastEditedControlField,
    selectedAircraftId,
    setAircraftTraffic,
    setControlError,
    setControlForm,
    setLastEditedControlField,
    setSelectedAircraftId
  });
  const {
    handleAdHocHoldFixCommand,
    handleAdHocHoldNowCommand,
    handleDirectToFix,
    handleProcedureMenuAction,
    handlePublishedHoldCommand
  } = useAircraftProcedureActionController({
    aircraftTraffic,
    controlForm,
    dataset,
    getSimulationNowMs: simulationNowMs,
    magneticVariationWestDeg,
    selectedAircraftId,
    selectedRunway,
    setAircraftTraffic,
    setControlError,
    setControlForm,
    setControlPanelOpen,
    setLastEditedControlField,
    setSelectedAircraftId
  });
  const {
    handleClearAircraftText,
    handleSetAircraftText
  } = useAircraftScratchpadTextController({
    selectedAircraftId,
    setAircraftTraffic,
    setControlForm,
    setLastEditedControlField
  });
  const { deleteAircraftWhere } = useAircraftDeleteController({
    aircraftTraffic,
    selectedAircraftId,
    setAircraftTraffic,
    setControlError,
    setControlPanelOpen,
    setSelectedAircraftId
  });
  const {
    cyclePilotSpeechMode,
    atcMicLevel,
    atcSpeechStatus,
    pilotSpeechEnabled,
    pilotSpeechFastMode,
    pilotSpeechStatus,
    pilotVoiceMode,
    pilotVoiceStatus,
    togglePilotVoiceMode,
    togglePushToTalkRecording
  } = useAtcVoiceBridge({
    aircraftTraffic,
    applyAtcCommandText,
    atcConsoleResult,
    dataset,
    liveSample: pttLiveSamplePrompt?.current ?? null,
    publicDemoMode: PUBLIC_DEMO_MODE,
    recordPttVoiceTrace,
    selectedRunway,
    setAtcCommandText,
    setAtcConsoleResult,
    setLastAtcCommandDebug,
    setLastSttContext,
    setLastTranscriptNormalization
  });
  const {
    activeArrivalStreams,
    activeDepartureWaves,
    handleAddArrivalStreamAircraft,
    handleClearArrivalStreams,
    handleClearDepartureWaves,
    handleDeleteSelectedStreamPreset,
    handleDeleteArrivalStreamAircraft,
    handleDeleteDepartureWaveAircraft,
    handleDepartureWaveFormChange,
    handleExportSelectedStreamPreset,
    handleImportStreamPresetFile,
    handleLoadSelectedStreamPreset,
    handleSaveStreamPreset,
    handleScenarioFormChange,
    handleSelectedStreamPresetIdChange,
    handleStartArrivalAutoKeep,
    handleStartDepartureWave,
    handleStreamPresetNameChange,
    loadScenarioStreamState,
    resetScenarioStreamUi,
    retimeDepartureFlowAfterMissedApproach,
    scenarioError,
    scenarioForm,
    scenarioPanelOpen,
    selectedStreamPreset,
    selectedStreamPresetId,
    setScenarioError,
    setScenarioPanelOpen,
    streamPresetImportInputRef,
    streamPresetName,
    streamPresetRecords
  } = useScenarioStreamController({
    aircraftTraffic,
    dataset,
    deleteAircraftWhere,
    getSimulationNowMs: simulationNowMs,
    radarPaused,
    selectedRunway,
    setAircraftTraffic,
    simulationSpeed
  });
  const { handleForceMissedApproach } = useMissedApproachController({
    aircraftTraffic,
    dataset,
    getSimulationNowMs: simulationNowMs,
    magneticVariationWestDeg,
    missedApproachProbability: scenarioForm.missedApproachProbability,
    radarPaused,
    retimeDepartureFlowAfterMissedApproach,
    selectedAircraftId,
    setAircraftTraffic,
    setAtcConsoleResult,
    setControlForm,
    setLastEditedControlField,
    setScenarioError,
    setSelectedAircraftId
  });
  const {
    aircraftCreateError,
    aircraftCreateForm,
    aircraftCreatePanelOpen,
    aircraftMapSpawnPoint,
    closeTrafficPanel,
    completeAircraftCreate,
    failAircraftCreate,
    handleAircraftCreateFormChange,
    handleCloseAircraftCreatePanel,
    handlePickedFixSpawn,
    handlePickMapSpawnPoint,
    handleRunwayModeChange: updateAircraftCreateForRunwayMode,
    handleToggleMapSpawnPick,
    mapSpawnPickActive,
    openTrafficPanelState,
    resetAircraftCreateUi,
    toggleTrafficPanelState,
    trafficPanelMode
  } = useAircraftCreateController({
    dataset,
    scenarioPanelOpen,
    selectedRunway,
    setControlPanelOpen,
    setScenarioError,
    setScenarioPanelOpen
  });
  const {
    closeWindPanel,
    handleCalmWind,
    handleRandomWind,
    handleWindEnabledChange,
    handleWindLayerChange,
    setWindSettings,
    toggleWindPanel,
    windPanelOpen,
    windSettings
  } = useWindSettingsController({
    closeScenarioStoragePanel: () => closeScenarioStoragePanelRef.current(),
    closeTrafficPanel,
    setControlPanelOpen
  });
  const {
    buildScenarioSnapshot,
    loadScenarioSnapshot
  } = useScenarioSnapshotController({
    activeArrivalStreams,
    activeDepartureWaves,
    aircraftTraffic,
    densityMode,
    loadScenarioStreamState,
    overlays,
    radarPaused,
    resetAircraftCreateUi,
    resetScenarioStreamUi,
    scenarioForm,
    selectedRunway,
    setAircraftTraffic,
    setControlError,
    setControlPanelOpen,
    setDensityMode,
    setLastRadarUpdateAt,
    setOverlays,
    setRadarPaused,
    setSelectedAircraftId,
    setSelectedRunway,
    setShowChrome,
    setSimulationSpeed,
    setSurfaceMode,
    setWindSettings,
    showChrome,
    simulationSpeed,
    simulationTimeRef,
    surfaceMode,
    windSettings
  });
  const scenarioStorage = useScenarioStorage({
    buildScenarioSnapshot,
    loadScenarioSnapshot,
    selectedRunway
  });
  closeScenarioStoragePanelRef.current = scenarioStorage.closePanel;
  const {
    handleBeginMeasure,
    openTrafficPanel,
    toggleScenarioStoragePanel,
    toggleTrafficPanel
  } = useScopePanelToggles({
    closeScenarioStoragePanel: scenarioStorage.closePanel,
    closeTrafficPanel,
    closeWindPanel,
    openScenarioStoragePanel: scenarioStorage.openPanel,
    openTrafficPanelState,
    resetAircraftCreateUi,
    scenarioStoragePanelOpen: scenarioStorage.panelOpen,
    setControlPanelOpen,
    setScenarioPanelOpen,
    toggleTrafficPanelState,
    trafficPanelMode
  });
  const {
    handlePickFixSpawn
  } = useFixSpawnPickController({
    closeScenarioStoragePanel: scenarioStorage.closePanel,
    closeWindPanel,
    dataset,
    handlePickedFixSpawn,
    selectedRunway,
    setControlPanelOpen
  });
  const {
    handleSelectAircraft
  } = useAircraftSelectionController({
    aircraftTraffic,
    closeScenarioStoragePanel: scenarioStorage.closePanel,
    dataset,
    resetAircraftCreateUi,
    setControlError,
    setControlForm,
    setControlPanelOpen,
    setLastEditedControlField,
    setScenarioPanelOpen,
    setSelectedAircraftId
  });

  useRadarDatasetLoader({
    setAircraftTraffic,
    setDataset,
    setError,
    setLastRadarUpdateAt,
    simulationTimeRef
  });

  useEffect(() => {
    saveCommandHistoryToStorage(undefined, atcCommandHistory);
  }, [atcCommandHistory]);

  function simulationNowMs() {
    return simulationTimeRef.current;
  }

  useRadarSimulationTick({
    dataset,
    radarPaused,
    setAircraftTraffic,
    setLastRadarUpdateAt,
    simulationSpeed,
    simulationTimeRef,
    windSettings
  });

  useSelectedAircraftDeleteHotkey({
    onDeleteSelectedAircraft: () =>
      deleteAircraftWhere((aircraft) => aircraft.id === selectedAircraftId),
    selectedAircraftId
  });

  usePilotFirstContactMonitor({
    aircraftTraffic,
    atcConsoleResult,
    dataset,
    radarPaused,
    setAircraftTraffic,
    setAtcConsoleResult,
    setSelectedAircraftId,
    simulationTimeRef
  });

  useRunwaySelectedAircraftGuard({
    aircraftTraffic,
    dataset,
    selectedAircraftId,
    selectedRunway,
    setControlPanelOpen,
    setSelectedAircraftId
  });

  function focusAtcCommandInput() {
    window.requestAnimationFrame(() => {
      atcCommandInputRef.current?.focus();
    });
  }

  function focusSelectedAircraftControlField(field: AircraftControlField) {
    if (!selectedAircraftId) {
      return;
    }

    closeTrafficPanel();
    closeWindPanel();
    scenarioStorage.closePanel();
    setLastEditedControlField(field);
    setControlPanelOpen(true);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const input = document.querySelector<HTMLInputElement>(
          `.aircraft-control-panel input[name="${field}"]`
        );

        input?.focus();
        input?.select();
      });
    });
  }

  function closeActiveScopePanel() {
    setControlPanelOpen(false);
    closeTrafficPanel();
    closeWindPanel();
    scenarioStorage.closePanel();
  }

  function toggleSelectedAircraftControlPanel() {
    if (!selectedAircraftId) {
      return;
    }

    if (controlPanelOpen) {
      setControlPanelOpen(false);
      return;
    }

    closeTrafficPanel();
    closeWindPanel();
    scenarioStorage.closePanel();
    setControlPanelOpen(true);
  }

  useScopeKeyboardShortcuts({
    onCloseActivePanel: closeActiveScopePanel,
    onFocusControlField: focusSelectedAircraftControlField,
    onFocusAtcCommand: focusAtcCommandInput,
    onSelectedRadioQueueAction: handleSelectedRadioQueueAction,
    onToggleChrome: () => setShowChrome((current) => !current),
    onToggleControlPanel: toggleSelectedAircraftControlPanel,
    onTogglePause: () => setRadarPaused((current) => !current),
    onToggleScenarioPanel: toggleScenarioStoragePanel,
    onToggleTrafficPanel: toggleTrafficPanel,
    onToggleWindPanel: toggleWindPanel
  });

  function handleRunwayModeChange(runway: RunwayMode) {
    setSelectedRunway(runway);
    updateAircraftCreateForRunwayMode(runway);
  }

  function handleCreateAircraft() {
    if (!dataset) {
      return;
    }

    const draft = buildAircraftCreateDraft({
      dataset,
      form: aircraftCreateForm,
      existingAircraft: aircraftTraffic,
      selectedRunway,
      stars,
      mapSpawnPoint: aircraftMapSpawnPoint,
      magneticVariationWestDeg,
      createdAtMs: Date.now(),
      guidanceActiveAtMs: simulationNowMs()
    });

    if (draft.status === "error") {
      failAircraftCreate(draft.message, Boolean(draft.activateMapPick));
      return;
    }

    const createdAircraft = draft.aircraft;

    setAircraftTraffic((currentAircraft) => [...currentAircraft, createdAircraft]);
    setSelectedAircraftId(createdAircraft.id);
    setControlForm(aircraftControlFormFromState(createdAircraft, magneticVariationWestDeg));
    setLastEditedControlField(null);
    setControlPanelOpen(true);
    completeAircraftCreate();
  }

  useSelectedAircraftControlFormSync({
    aircraftTraffic,
    controlPanelOpen,
    dataset,
    lastEditedControlField,
    selectedAircraftId,
    setControlForm
  });

  if (error) {
    return (
      <main className="scope-page">
        <section className="loading-card error-card">
          <h1>RKPC Radar Surface</h1>
          <DemoSafetyCopy />
          <p>데이터 로딩 실패</p>
          <code>{error}</code>
        </section>
      </main>
    );
  }

  if (!dataset) {
    return (
      <main className="scope-page">
        <section className="loading-card">
          <h1>RKPC Radar Surface</h1>
          <DemoSafetyCopy />
          <p>제주 TMA exact data와 renderer surface를 준비하는 중입니다.</p>
        </section>
      </main>
    );
  }

  const {
    aircraftCreateDepartureFixes,
    aircraftCreateDepartureRunway,
    aircraftCreateExitFix,
    approachCount,
    arrivalStreamFixes,
    atcMicHud,
    departureRunwaysForPanel,
    departureStreamFixesByRunway,
    effectiveOverlays,
    fixSpawnPickActive,
    overlayCounts,
    selectedAircraft,
    selectedPublishedHoldFixId,
    sidCount,
    spawnFixes,
    starCount,
    stars,
    visibleAircraft
  } = appScopeViewModel({
    aircraftCreateForm,
    aircraftCreatePanelOpen,
    aircraftTraffic,
    atcMicLevel,
    atcSpeechStatus,
    dataset,
    overlays,
    selectedAircraftId,
    selectedRunway,
    surfaceMode,
    trafficPanelMode
  });

  function handleAtcCommandTextChangeWithHistory(value: string) {
    atcCommandHistoryDraftRef.current = "";
    setAtcCommandHistoryCursor(null);
    handleAtcCommandTextChange(value);
  }

  function handleAtcCommandSubmitWithHistory(event: FormEvent<HTMLFormElement>) {
    const submittedCommand =
      event.currentTarget.querySelector<HTMLInputElement>('[data-testid="atc-command-input"]')
        ?.value ?? atcCommandText;

    handleAtcCommandSubmit(event);
    setAtcCommandHistory((currentHistory) =>
      commandHistoryAfterSubmit(currentHistory, submittedCommand)
    );
    setAtcCommandHistoryCursor(null);
    atcCommandHistoryDraftRef.current = "";
  }

  function applyAtcCommandTextWithHistory(commandText: string) {
    setLastTranscriptNormalization(null);
    setLastSttContext(null);
    setAtcCommandText(commandText);
    applyAtcCommandText(commandText);
    setAtcCommandHistory((currentHistory) =>
      commandHistoryAfterSubmit(currentHistory, commandText)
    );
    setAtcCommandHistoryCursor(null);
    atcCommandHistoryDraftRef.current = "";
  }

  function handleAtcCommandHistoryKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }

    event.preventDefault();

    const historyStep = commandHistoryStep({
      currentValue: atcCommandText,
      cursor: atcCommandHistoryCursor,
      direction: event.key === "ArrowUp" ? "previous" : "next",
      draft: atcCommandHistoryDraftRef.current,
      history: atcCommandHistory
    });

    atcCommandHistoryDraftRef.current = historyStep.draft;
    setAtcCommandHistoryCursor(historyStep.cursor);
    setAtcCommandText(historyStep.value);
  }

  const radioQueue = radioQueueRows(aircraftTraffic);
  const radioQueueActionsDisabled = radioExchangePhaseBlocksPilotFirstContact(
    atcConsoleResult.radio_exchange_phase
  );
  const selectedRadioQueueRow = selectedAircraft
    ? radioQueue.find((row) => row.aircraftId === selectedAircraft.id) ?? null
    : null;

  function handleRadioQueueAction(callsign: string, action: RadioQueueAction) {
    if (radioQueueActionsDisabled) {
      return;
    }

    applyAtcCommandTextWithHistory(radioQueueActionCommandText(callsign, action));
  }

  function handleSelectedRadioQueueAction(action: RadioQueueAction) {
    if (radioQueueActionsDisabled) {
      return;
    }

    const commandText = radioQueueSelectedActionCommandText(radioQueue, selectedAircraftId, action);
    if (!commandText) {
      return;
    }

    applyAtcCommandTextWithHistory(commandText);
  }

  const atcCommandConsoleProps: AtcCommandConsoleProps = {
    atcCommandText,
    atcConsoleResult,
    atcSpeechStatus,
    inputRef: atcCommandInputRef,
    lastAtcCommandDebug,
    lastCommandSplit,
    lastSttContextDisplay: lastSttContext?.display ?? null,
    lastTranscriptNormalization,
    latestPttVoiceTrace,
    onCommandInputKeyDown: handleAtcCommandHistoryKeyDown,
    onCommandTextChange: handleAtcCommandTextChangeWithHistory,
    onCyclePilotSpeechMode: cyclePilotSpeechMode,
    onClearPttTraces: clearStoredPttVoiceTraces,
    onExportPttTraces: exportPttVoiceTraceJson,
    onLabelPttTrace: labelLatestPttVoiceTrace,
    onRadioQueueAction: handleRadioQueueAction,
    onSubmit: handleAtcCommandSubmitWithHistory,
    onTogglePilotVoiceMode: togglePilotVoiceMode,
    onTogglePushToTalkRecording: togglePushToTalkRecording,
    pilotSpeechEnabled,
    pilotSpeechFastMode,
    pilotSpeechStatus,
    pilotVoiceMode,
    pilotVoiceStatus,
    publicDemoMode: PUBLIC_DEMO_MODE,
    pttLiveSamplePrompt,
    pttTraceExportStatus,
    pttVoiceTraceSummary,
    radioQueueRows: radioQueue
  };

  return (
    <main className="scope-page radar-first-page">
      <section className={showChrome ? "radar-stage" : "radar-stage chrome-hidden"}>
        <div aria-label="Training-only safety boundary" className="demo-safety-banner" role="note">
          <strong>Training-only simulator</strong>
          <span>Not for operational ATC, navigation, dispatch, certification, or safety-critical use.</span>
          {PUBLIC_DEMO_MODE ? <em>Static public demo: text commands and deterministic responses only.</em> : null}
        </div>

        <ScopeFloatingControls
          onSimulationSpeedChange={setSimulationSpeed}
          onToggleChrome={() => setShowChrome((current) => !current)}
          onToggleRadarPause={() => setRadarPaused((current) => !current)}
          onToggleScenarioStoragePanel={toggleScenarioStoragePanel}
          onToggleTrafficPanel={toggleTrafficPanel}
          onToggleWindPanel={toggleWindPanel}
          radarPaused={radarPaused}
          scenarioStoragePanelOpen={scenarioStorage.panelOpen}
          showChrome={showChrome}
          simulationSpeed={simulationSpeed}
          trafficPanelOpen={aircraftCreatePanelOpen || scenarioPanelOpen}
          windEnabled={windSettings.enabled}
          windPanelOpen={windPanelOpen}
        />

        <AtcMicrophoneHud
          barCount={atcMicHud.barCount}
          isLow={atcMicHud.isLow}
          primary={atcMicHud.primary}
          secondary={atcMicHud.secondary}
          state={atcSpeechStatus.state}
        />

        {showChrome ? (
          <ScopeOverlayControls
            approachCount={approachCount}
            atcCommandConsoleProps={atcCommandConsoleProps}
            compactOverlayKeys={COMPACT_SCOPE_OVERLAY_KEYS}
            densityMode={densityMode}
            effectiveOverlays={effectiveOverlays}
            exactOverlayCount={overlayCounts.exact}
            onDensityModeChange={setDensityMode}
            onRunwayModeChange={handleRunwayModeChange}
            onSurfaceModeChange={setSurfaceMode}
            onToggleOverlay={handleToggleOverlay}
            overlayLabels={SCOPE_OVERLAY_LABELS}
            overlays={overlays}
            radarStatusLabel={radarPaused ? "PAUSED" : `TICK ${formatRadarTickInterval(simulationSpeed)}S`}
            selectedRunway={selectedRunway}
            sidCount={sidCount}
            starCount={starCount}
            supportOverlayCount={overlayCounts.support}
            supportOverlayKeys={SUPPORT_SCOPE_OVERLAY_KEYS}
            surfaceMode={surfaceMode}
            visibleAircraftCount={effectiveOverlays.traffic ? visibleAircraft.length : 0}
          />
        ) : null}

        {!showChrome ? (
          <ScopeCommandStrip
            atcCommandInputRef={atcCommandInputRef}
            atcCommandText={atcCommandText}
            atcConsoleResult={atcConsoleResult}
            atcSpeechState={atcSpeechStatus.state}
            onCommandInputKeyDown={handleAtcCommandHistoryKeyDown}
            onCommandTextChange={handleAtcCommandTextChangeWithHistory}
            onFocusControlField={focusSelectedAircraftControlField}
            onOpenControlPanel={toggleSelectedAircraftControlPanel}
            onSubmit={handleAtcCommandSubmitWithHistory}
            onTogglePushToTalkRecording={togglePushToTalkRecording}
            publicDemoMode={PUBLIC_DEMO_MODE}
            selectedAircraftLabel={selectedAircraft?.callsign ?? null}
          />
        ) : null}

        <RadarMap
          aircraft={effectiveOverlays.traffic ? visibleAircraft : []}
          densityMode={densityMode}
          dataset={dataset}
          onAssignProcedureAction={handleProcedureMenuAction}
          onApplyAircraftCommand={handleAircraftQuickCommand}
          onApplyAdHocHoldFix={(aircraftId, fixId) =>
            handleAdHocHoldFixCommand(aircraftId, fixId, true)
          }
          onApplyAdHocHoldNow={(aircraftId) =>
            handleAdHocHoldNowCommand(aircraftId, true)
          }
          onApplyPublishedHold={handlePublishedHoldCommand}
          onBeginMeasure={handleBeginMeasure}
          onClearAircraftText={handleClearAircraftText}
          onDirectToFix={handleDirectToFix}
          onPickFixSpawn={handlePickFixSpawn}
          onSelectAircraft={handleSelectAircraft}
          onSetAircraftText={handleSetAircraftText}
          overlays={effectiveOverlays}
          selectedAircraftId={selectedAircraft?.id ?? null}
          selectedAircraftDirectFixId={selectedAircraft?.next_fix ?? null}
          selectedRunway={selectedRunway}
          showChrome={showChrome}
          surfaceMode={surfaceMode}
          lastRadarUpdateAt={lastRadarUpdateAt}
          fixSpawnPickActive={fixSpawnPickActive}
          mapSpawnPickActive={mapSpawnPickActive}
          mapSpawnPoint={aircraftMapSpawnPoint}
          onPickMapSpawnPoint={handlePickMapSpawnPoint}
          radarPaused={radarPaused}
          magneticVariationWestDeg={magneticVariationWestDeg}
        />

        <datalist id={altitudePresetDatalistId}>
          {altitudePresetOptions.map((option) => (
            <option key={option.value} value={option.value} />
          ))}
        </datalist>

        <ScenarioSidePanels
          aircraftCreatePanelOpen={aircraftCreatePanelOpen}
          aircraftCreatePanelProps={{
            aircraftCreateDepartureFixes,
            aircraftCreateDepartureRunway,
            aircraftCreateError,
            aircraftCreateExitFix,
            aircraftCreateForm,
            aircraftMapSpawnPoint,
            departureRunwaysForPanel,
            mapSpawnPickActive,
            onClose: handleCloseAircraftCreatePanel,
            onCreateAircraft: handleCreateAircraft,
            onFormChange: handleAircraftCreateFormChange,
            onToggleMapSpawnPick: handleToggleMapSpawnPick,
            onTrafficModeChange: openTrafficPanel,
            spawnFixes,
            trafficPanelMode
          }}
          scenarioStoragePanelOpen={scenarioStorage.panelOpen}
          scenarioStoragePanelProps={{
            builtInScenarioPresets: scenarioStorage.builtInScenarioPresets,
            importInputRef: scenarioStorage.importInputRef,
            onClose: scenarioStorage.closePanel,
            onDeleteSelectedScenario: scenarioStorage.handleDeleteSelectedScenario,
            onExportSelectedScenario: scenarioStorage.handleExportSelectedScenario,
            onImportScenarioFile: scenarioStorage.handleImportScenarioFile,
            onLoadSelectedBuiltInPreset: scenarioStorage.handleLoadSelectedBuiltInPreset,
            onLoadSelectedScenario: scenarioStorage.handleLoadSelectedScenario,
            onSaveScenario: scenarioStorage.handleSaveScenario,
            onSelectedBuiltInPresetIdChange: scenarioStorage.handleSelectedBuiltInPresetIdChange,
            onSelectedScenarioRecordIdChange: scenarioStorage.handleSelectedRecordIdChange,
            onStorageNameChange: scenarioStorage.handleStorageNameChange,
            savedScenarioRecords: scenarioStorage.records,
            scenarioStorageMessage: scenarioStorage.storageMessage,
            scenarioStorageName: scenarioStorage.storageName,
            selectedBuiltInPreset: scenarioStorage.selectedBuiltInPreset,
            selectedBuiltInPresetId: scenarioStorage.selectedBuiltInPresetId,
            selectedRunway,
            selectedScenarioRecordId: scenarioStorage.selectedRecordId,
            selectedSavedScenario: scenarioStorage.selectedRecord
          }}
          scenarioStreamPanelOpen={scenarioPanelOpen}
          scenarioStreamPanelProps={{
            activeArrivalStreams,
            activeDepartureWaves,
            arrivalStreamFixes,
            departureRunwaysForPanel,
            departureStreamFixesByRunway,
            onAddArrivalStreamAircraft: handleAddArrivalStreamAircraft,
            onClearArrivalStreams: handleClearArrivalStreams,
            onClearDepartureWaves: handleClearDepartureWaves,
            onClose: closeTrafficPanel,
            onDeleteArrivalStreamAircraft: handleDeleteArrivalStreamAircraft,
            onDeleteDepartureWaveAircraft: handleDeleteDepartureWaveAircraft,
            onDeleteSelectedStreamPreset: handleDeleteSelectedStreamPreset,
            onDepartureWaveFormChange: handleDepartureWaveFormChange,
            onExportSelectedStreamPreset: handleExportSelectedStreamPreset,
            onForceMissedApproach: handleForceMissedApproach,
            onImportStreamPresetFile: handleImportStreamPresetFile,
            onLoadSelectedStreamPreset: handleLoadSelectedStreamPreset,
            onSaveStreamPreset: handleSaveStreamPreset,
            onScenarioFormChange: handleScenarioFormChange,
            onSelectedStreamPresetIdChange: handleSelectedStreamPresetIdChange,
            onStartArrivalAutoKeep: handleStartArrivalAutoKeep,
            onStartDepartureWave: handleStartDepartureWave,
            onStreamPresetNameChange: handleStreamPresetNameChange,
            onTrafficModeChange: openTrafficPanel,
            scenarioError,
            scenarioForm,
            selectedAircraftLabel: selectedAircraft?.callsign ?? null,
            selectedRunway,
            selectedStreamPreset,
            selectedStreamPresetId,
            streamPresetImportInputRef,
            streamPresetName,
            streamPresetRecords,
            trafficPanelMode
          }}
          windPanelOpen={windPanelOpen}
          windSettingsPanelProps={{
            onCalm: handleCalmWind,
            onClose: closeWindPanel,
            onEnabledChange: handleWindEnabledChange,
            onLayerChange: handleWindLayerChange,
            onRandom: handleRandomWind,
            windSettings
          }}
        />

        {controlPanelOpen && selectedAircraft ? (
          <SelectedAircraftControlPanel
            aircraft={selectedAircraft}
            airportMagVar={dataset.airport.airport_meta.mag_var}
            controlError={controlError}
            controlForm={controlForm}
            magneticVariationWestDeg={magneticVariationWestDeg}
            onClose={() => setControlPanelOpen(false)}
            onControlFormChange={handleControlFormChange}
            onExpediteDescentCommand={applyExpediteDescentCommand}
            onFormKeyDown={handleAircraftControlPanelKeyDown}
            onFormSubmit={handleAircraftControlPanelSubmit}
            onAdHocHoldFixCommand={handleAdHocHoldFixCommand}
            onAdHocHoldNowCommand={handleAdHocHoldNowCommand}
            onPublishedHoldCommand={handlePublishedHoldCommand}
            onResumeNormalCommand={applyResumeNormalCommand}
            onRadioQueueAction={handleSelectedRadioQueueAction}
            onVerticalProcedureModeCommand={applyVerticalProcedureModeCommand}
            publishedHoldFixId={selectedPublishedHoldFixId}
            radioQueueActionsDisabled={radioQueueActionsDisabled}
            radioQueueRow={selectedRadioQueueRow}
          />
        ) : null}
      </section>
    </main>
  );
}
