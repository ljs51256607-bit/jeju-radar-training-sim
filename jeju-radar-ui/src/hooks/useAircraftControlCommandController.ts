import {
  type Dispatch,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type SetStateAction
} from "react";
import {
  aircraftControlFormAfterCommand,
  applyAircraftControlCommandDraftToAircraft,
  buildAircraftControlCommandDraft
} from "../lib/aircraftControlCommandRuntime";
import {
  controlFieldFromEventTarget,
  controlFormOverrideFromEventTarget,
  type AircraftControlField,
  type AircraftControlForm
} from "../lib/aircraftControlPanel";
import {
  canExpediteDescent,
  expediteDescent,
  resumeNormalSpeed,
  resumeNormalVerticalMode
} from "../lib/flightProfileGuidance";
import {
  aircraftWithVerticalProcedureMode,
  buildVerticalProcedureModeDraft
} from "../lib/verticalProcedureModeRuntime";
import { commandActivationTimeMs } from "../lib/simulationTickRuntime";
import type {
  AircraftQuickCommandField,
  AircraftState,
  AircraftVerticalProcedureMode,
  RadarDataset
} from "../lib/types";

interface UseAircraftControlCommandControllerOptions {
  aircraftTraffic: AircraftState[];
  controlForm: AircraftControlForm;
  dataset: RadarDataset | null;
  getSimulationNowMs: () => number;
  lastEditedControlField: AircraftControlField | null;
  selectedAircraftId: string | null;
  setAircraftTraffic: Dispatch<SetStateAction<AircraftState[]>>;
  setControlError: Dispatch<SetStateAction<string | null>>;
  setControlForm: Dispatch<SetStateAction<AircraftControlForm>>;
  setLastEditedControlField: Dispatch<SetStateAction<AircraftControlField | null>>;
  setSelectedAircraftId: Dispatch<SetStateAction<string | null>>;
}

export function useAircraftControlCommandController({
  aircraftTraffic,
  controlForm,
  dataset,
  getSimulationNowMs,
  lastEditedControlField,
  selectedAircraftId,
  setAircraftTraffic,
  setControlError,
  setControlForm,
  setLastEditedControlField,
  setSelectedAircraftId
}: UseAircraftControlCommandControllerOptions) {
  function handleControlFormChange(field: AircraftControlField, value: string) {
    setControlForm((currentForm) => ({
      ...currentForm,
      [field]: value
    }));
    setLastEditedControlField(field);
    setControlError(null);
  }

  function handleAircraftControlPanelKeyDown(event: ReactKeyboardEvent<HTMLFormElement>) {
    if (event.key !== "Enter") {
      return;
    }

    const commandField = controlFieldFromEventTarget(event.target);
    const commandInput = event.target instanceof HTMLInputElement ? event.target : null;
    event.preventDefault();
    applyAircraftControlCommand(
      commandField ?? lastEditedControlField,
      controlFormOverrideFromEventTarget(event.target, commandField)
    );
    commandInput?.blur();
  }

  function handleAircraftControlPanelSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyAircraftControlCommand();
  }

  function applyAircraftControlCommand(
    commandField = lastEditedControlField,
    formOverride: Partial<AircraftControlForm> = {},
    targetAircraftId = selectedAircraftId
  ) {
    if (!targetAircraftId) {
      return;
    }

    if (!commandField) {
      return;
    }

    const draft = buildAircraftControlCommandDraft({
      commandField,
      controlForm,
      formOverride,
      targetAircraftId,
      aircraftTraffic,
      dataset,
      issuedAtMs: getSimulationNowMs()
    });

    if (draft.status === "error") {
      setControlError(draft.message);
      return;
    }

    setAircraftTraffic((currentAircraft) =>
      currentAircraft.map((aircraft) => applyAircraftControlCommandDraftToAircraft(aircraft, draft))
    );
    setControlForm((currentForm) => aircraftControlFormAfterCommand(currentForm, draft));
    setLastEditedControlField(null);
    setControlError(null);
  }

  function handleAircraftQuickCommand(
    aircraftId: string,
    field: AircraftQuickCommandField,
    value: string
  ) {
    setSelectedAircraftId(aircraftId);
    applyAircraftControlCommand(field, { [field]: value } as Partial<AircraftControlForm>, aircraftId);
  }

  function applyResumeNormalCommand(mode: "speed" | "climb" | "descent") {
    if (!selectedAircraftId || !dataset) {
      return;
    }

    const activeAtMs = commandActivationTimeMs(
      dataset,
      mode === "speed" ? "SPD" : "VS",
      getSimulationNowMs()
    );
    const selectedAircraftForCommand = aircraftTraffic.find(
      (aircraft) => aircraft.id === selectedAircraftId
    );
    const previewUpdatedAircraft = selectedAircraftForCommand
      ? mode === "speed"
        ? resumeNormalSpeed(selectedAircraftForCommand, dataset, activeAtMs)
        : resumeNormalVerticalMode(
            selectedAircraftForCommand,
            dataset,
            mode === "climb" ? "climb" : "descent",
            activeAtMs
          )
      : null;

    setAircraftTraffic((currentAircraft) =>
      currentAircraft.map((aircraft) => {
        if (aircraft.id !== selectedAircraftId) {
          return aircraft;
        }

        return (
          mode === "speed"
            ? resumeNormalSpeed(aircraft, dataset, activeAtMs)
            : resumeNormalVerticalMode(
                aircraft,
                dataset,
                mode === "climb" ? "climb" : "descent",
                activeAtMs
              )
        );
      })
    );

    setControlForm((currentForm) => ({
      ...currentForm,
      ...(mode === "speed" && previewUpdatedAircraft?.execution_speed_kt !== undefined
        ? { speed: String(Math.round(previewUpdatedAircraft.execution_speed_kt)) }
        : {}),
      ...(mode !== "speed" && previewUpdatedAircraft?.execution_vertical_rate_fpm !== undefined
        ? { verticalRate: String(Math.round(previewUpdatedAircraft.execution_vertical_rate_fpm)) }
        : {})
    }));
    setLastEditedControlField(null);
    setControlError(null);
  }

  function applyExpediteDescentCommand() {
    if (!selectedAircraftId || !dataset) {
      return;
    }

    const selectedAircraftForCommand = aircraftTraffic.find(
      (aircraft) => aircraft.id === selectedAircraftId
    );

    if (!selectedAircraftForCommand || !canExpediteDescent(selectedAircraftForCommand)) {
      setControlError("하강 목표 고도 또는 하강 중인 항공기에만 EXP DES 적용");
      return;
    }

    const activeAtMs = commandActivationTimeMs(dataset, "VS", getSimulationNowMs());
    const previewUpdatedAircraft = expediteDescent(selectedAircraftForCommand, dataset, activeAtMs);

    setAircraftTraffic((currentAircraft) =>
      currentAircraft.map((aircraft) =>
        aircraft.id === selectedAircraftId ? expediteDescent(aircraft, dataset, activeAtMs) : aircraft
      )
    );

    setControlForm((currentForm) => ({
      ...currentForm,
      ...(previewUpdatedAircraft.execution_vertical_rate_fpm !== undefined
        ? { verticalRate: String(Math.round(previewUpdatedAircraft.execution_vertical_rate_fpm)) }
        : {})
    }));
    setLastEditedControlField(null);
    setControlError(null);
  }

  function applyVerticalProcedureModeCommand(
    mode: Extract<AircraftVerticalProcedureMode, "des_via" | "cancel_level">
  ) {
    if (!selectedAircraftId || !dataset) {
      return;
    }

    const draft = buildVerticalProcedureModeDraft({
      selectedAircraftId,
      aircraftTraffic,
      stars: dataset.procedures.stars,
      mode
    });

    if (draft.status === "noop") {
      return;
    }

    if (draft.status === "error") {
      setControlError(draft.message);
      return;
    }

    setAircraftTraffic((currentAircraft) =>
      currentAircraft.map((aircraft) =>
        aircraft.id === draft.aircraftId
          ? aircraftWithVerticalProcedureMode(aircraft, dataset.procedures.stars, mode)
          : aircraft
      )
    );

    setControlForm((currentForm) => ({
      ...currentForm,
      ...draft.controlUpdates
    }));
    setLastEditedControlField(null);
    setControlError(null);
  }

  return {
    applyExpediteDescentCommand,
    applyResumeNormalCommand,
    applyVerticalProcedureModeCommand,
    handleAircraftControlPanelKeyDown,
    handleAircraftControlPanelSubmit,
    handleAircraftQuickCommand,
    handleControlFormChange
  };
}
