import {
  type Dispatch,
  type SetStateAction
} from "react";
import {
  parseAltitudeInput,
  parseSpeedInput,
  type AircraftControlField,
  type AircraftControlForm
} from "../lib/aircraftControlPanel";
import { initialBearingTrueDeg } from "../lib/aircraftMotion";
import {
  adHocHoldingPatternAtFix,
  adHocHoldingPatternAtPresentPosition,
  aircraftWithHoldingPatternCommand,
  holdingPatternForFix
} from "../lib/holdingPatterns";
import {
  applyMapDirectToFixDraftToAircraft,
  buildMapDirectToFixDraft,
  mapDirectToFixControlFormAfterDraft
} from "../lib/mapDirectToFixRuntime";
import {
  applyProcedureAssignmentDraftToAircraft,
  buildProcedureAssignmentDraft,
  procedureAssignmentControlFormAfterDraft
} from "../lib/procedureAssignmentRuntime";
import { evaluateProcedureMenuAction } from "../lib/procedureMenuActionRuntime";
import { resolveDirectFix } from "../lib/procedureGuidance";
import type { ProcedureKind } from "../lib/procedureRouteUtils";
import { normalizeFixId } from "../lib/scenarioTraffic";
import { commandActivationTimeMs } from "../lib/simulationTickRuntime";
import type {
  AircraftState,
  AircraftVerticalProcedureMode,
  MapLabel,
  ProcedureMenuAction,
  ProcedureRecord,
  RadarDataset,
  RunwayMode
} from "../lib/types";

interface UseAircraftProcedureActionControllerOptions {
  aircraftTraffic: AircraftState[];
  controlForm: AircraftControlForm;
  dataset: RadarDataset | null;
  getSimulationNowMs: () => number;
  magneticVariationWestDeg: number;
  selectedAircraftId: string | null;
  selectedRunway: RunwayMode;
  setAircraftTraffic: Dispatch<SetStateAction<AircraftState[]>>;
  setControlError: Dispatch<SetStateAction<string | null>>;
  setControlForm: Dispatch<SetStateAction<AircraftControlForm>>;
  setControlPanelOpen: Dispatch<SetStateAction<boolean>>;
  setLastEditedControlField: Dispatch<SetStateAction<AircraftControlField | null>>;
  setSelectedAircraftId: Dispatch<SetStateAction<string | null>>;
}

export function useAircraftProcedureActionController({
  aircraftTraffic,
  controlForm,
  dataset,
  getSimulationNowMs,
  magneticVariationWestDeg,
  selectedAircraftId,
  selectedRunway,
  setAircraftTraffic,
  setControlError,
  setControlForm,
  setControlPanelOpen,
  setLastEditedControlField,
  setSelectedAircraftId
}: UseAircraftProcedureActionControllerOptions) {
  function handlePublishedHoldCommand(
    aircraftId: string,
    altitudeValue: string,
    speedValue: string,
    closeControlPanelAfterApply = true
  ) {
    if (!dataset) {
      return;
    }

    const targetAircraft = aircraftTraffic.find((aircraft) => aircraft.id === aircraftId);

    if (!targetAircraft) {
      setControlError("항공기를 찾을 수 없음");
      return;
    }

    const holdFixId = targetAircraft.next_fix;

    if (!holdFixId) {
      setSelectedAircraftId(aircraftId);
      setControlPanelOpen(true);
      setControlError("먼저 홀딩 FIX로 DCT 지정 필요");
      return;
    }

    const pattern = holdingPatternForFix(holdFixId, targetAircraft);

    if (!pattern) {
      setSelectedAircraftId(aircraftId);
      setControlPanelOpen(true);
      setControlError(`${holdFixId} published holding 없음`);
      return;
    }

    const trimmedAltitudeValue = altitudeValue.trim();
    const trimmedSpeedValue = speedValue.trim();
    const altitudeFt = trimmedAltitudeValue ? parseAltitudeInput(trimmedAltitudeValue) : null;
    const speedKt = trimmedSpeedValue ? parseSpeedInput(trimmedSpeedValue) : null;

    if (trimmedAltitudeValue && altitudeFt === null) {
      setSelectedAircraftId(aircraftId);
      setControlPanelOpen(true);
      setControlError("홀딩 고도 입력 확인 필요");
      return;
    }

    if (trimmedSpeedValue && speedKt === null) {
      setSelectedAircraftId(aircraftId);
      setControlPanelOpen(true);
      setControlError("홀딩 속도 입력 확인 필요");
      return;
    }

    const activeAtMs = commandActivationTimeMs(dataset, "HDG", getSimulationNowMs());

    setAircraftTraffic((currentAircraft) =>
      currentAircraft.map((aircraft) =>
        aircraft.id === aircraftId
          ? aircraftWithHoldingPatternCommand({
              activeAtMs,
              aircraft,
              ...(typeof altitudeFt === "number" ? { altitudeFt } : {}),
              pattern,
              ...(typeof speedKt === "number" ? { speedKt } : {})
            })
          : aircraft
      )
    );
    setSelectedAircraftId(aircraftId);
    setControlForm((currentForm) => ({
      ...currentForm,
      ...(typeof altitudeFt === "number" ? { altitude: trimmedAltitudeValue.toUpperCase() } : {}),
      ...(typeof speedKt === "number" ? { speed: String(speedKt) } : {}),
      scratchpad: targetAircraft.scratchpad?.includes("HLD")
        ? targetAircraft.scratchpad
        : [targetAircraft.scratchpad, "HLD"].filter(Boolean).join(" ").trim()
    }));
    setControlPanelOpen(!closeControlPanelAfterApply);
    setLastEditedControlField(null);
    setControlError(null);
  }

  function handleAdHocHoldNowCommand(
    aircraftId: string,
    closeControlPanelAfterApply = true
  ) {
    if (!dataset) {
      return;
    }

    const targetAircraft = aircraftTraffic.find((aircraft) => aircraft.id === aircraftId);

    if (!targetAircraft) {
      setControlError("항공기를 찾을 수 없음");
      return;
    }

    const activeAtMs = commandActivationTimeMs(dataset, "HDG", getSimulationNowMs());

    setAircraftTraffic((currentAircraft) =>
      currentAircraft.map((aircraft) => {
        if (aircraft.id !== aircraftId) {
          return aircraft;
        }

        const pattern = adHocHoldingPatternAtPresentPosition({
          activeAtMs,
          aircraft
        });

        return aircraftWithHoldingPatternCommand({
          activeAtMs,
          aircraft,
          pattern,
          startAtAnchor: true
        });
      })
    );
    setSelectedAircraftId(aircraftId);
    setControlForm((currentForm) => ({
      ...currentForm,
      scratchpad: targetAircraft.scratchpad?.includes("HLD")
        ? targetAircraft.scratchpad
        : [targetAircraft.scratchpad, "HLD"].filter(Boolean).join(" ").trim()
    }));
    setControlPanelOpen(!closeControlPanelAfterApply);
    setLastEditedControlField(null);
    setControlError(null);
  }

  function handleAdHocHoldFixCommand(
    aircraftId: string,
    fixValue = "",
    closeControlPanelAfterApply = true
  ) {
    if (!dataset) {
      return;
    }

    const targetAircraft = aircraftTraffic.find((aircraft) => aircraft.id === aircraftId);

    if (!targetAircraft) {
      setControlError("항공기를 찾을 수 없음");
      return;
    }

    const requestedFixId = normalizeFixId(
      fixValue || controlForm.scratchpad || targetAircraft.next_fix || ""
    );

    if (!requestedFixId) {
      setSelectedAircraftId(aircraftId);
      setControlPanelOpen(true);
      setControlError("홀딩 FIX 필요: TEXT 칸에 FIX 입력 또는 DCT 먼저 지정");
      return;
    }

    const fix = resolveDirectFix(dataset, requestedFixId);

    if (!fix) {
      setSelectedAircraftId(aircraftId);
      setControlPanelOpen(true);
      setControlError(`${requestedFixId} FIX 확인 필요`);
      return;
    }

    const activeAtMs = commandActivationTimeMs(dataset, "HDG", getSimulationNowMs());
    const inboundCourseTrueDeg = initialBearingTrueDeg(
      targetAircraft.latitude,
      targetAircraft.longitude,
      fix.latitude,
      fix.longitude
    );
    const pattern = adHocHoldingPatternAtFix({
      activeAtMs,
      aircraft: targetAircraft,
      fix,
      fixId: requestedFixId,
      inboundCourseDeg: inboundCourseTrueDeg
    });

    setAircraftTraffic((currentAircraft) =>
      currentAircraft.map((aircraft) =>
        aircraft.id === aircraftId
          ? aircraftWithHoldingPatternCommand({
              activeAtMs,
              aircraft,
              pattern
            })
          : aircraft
      )
    );
    setSelectedAircraftId(aircraftId);
    setControlForm((currentForm) => ({
      ...currentForm,
      scratchpad: targetAircraft.scratchpad?.includes("HLD")
        ? targetAircraft.scratchpad
        : [targetAircraft.scratchpad, "HLD"].filter(Boolean).join(" ").trim()
    }));
    setControlPanelOpen(!closeControlPanelAfterApply);
    setLastEditedControlField(null);
    setControlError(null);
  }

  function handleDirectToFix(fix: MapLabel) {
    if (!selectedAircraftId || !dataset) {
      return;
    }

    const guidanceActiveAtMs = commandActivationTimeMs(dataset, "DCT", getSimulationNowMs());
    const draft = buildMapDirectToFixDraft(fix, guidanceActiveAtMs);

    setAircraftTraffic((currentAircraft) =>
      currentAircraft.map((aircraft) =>
        aircraft.id === selectedAircraftId ? applyMapDirectToFixDraftToAircraft(aircraft, draft) : aircraft
      )
    );

    const aircraft = aircraftTraffic.find((candidate) => candidate.id === selectedAircraftId);

    if (aircraft) {
      setControlForm((currentForm) =>
        mapDirectToFixControlFormAfterDraft(currentForm, aircraft, draft, magneticVariationWestDeg)
      );
    }

    setControlPanelOpen(false);
    setLastEditedControlField(null);
    setControlError(null);
  }

  function applyProcedureToAircraft(
    aircraftId: string,
    kind: ProcedureKind,
    procedure: ProcedureRecord,
    options: { verticalProcedureMode?: AircraftVerticalProcedureMode } = {}
  ) {
    if (!dataset) {
      return false;
    }

    const selectedAircraftForProcedure = aircraftTraffic.find(
      (candidate) => candidate.id === aircraftId
    );

    if (!selectedAircraftForProcedure) {
      setControlError("항공기를 찾을 수 없음");
      return false;
    }

    const draft = buildProcedureAssignmentDraft({
      aircraft: selectedAircraftForProcedure,
      kind,
      procedure,
      dataset,
      verticalProcedureMode: options.verticalProcedureMode,
      issuedAtMs: getSimulationNowMs()
    });

    if (draft.status === "error") {
      setControlError(draft.message);
      return false;
    }

    setAircraftTraffic((currentAircraft) =>
      currentAircraft.map((aircraft) => {
        if (aircraft.id !== aircraftId) {
          return aircraft;
        }

        return applyProcedureAssignmentDraftToAircraft(aircraft, draft);
      })
    );

    setSelectedAircraftId(aircraftId);
    setControlForm((currentForm) =>
      procedureAssignmentControlFormAfterDraft(
        currentForm,
        selectedAircraftForProcedure,
        draft,
        magneticVariationWestDeg
      )
    );

    setControlPanelOpen(false);
    setLastEditedControlField(null);
    setControlError(null);
    return true;
  }

  function handleProcedureMenuAction(aircraftId: string, action: ProcedureMenuAction) {
    if (!dataset) {
      return;
    }

    const evaluation = evaluateProcedureMenuAction({
      aircraftId,
      action,
      aircraftTraffic,
      procedures: dataset.procedures,
      selectedRunway
    });

    if (evaluation.status === "error") {
      if (evaluation.targetAircraftId) {
        setSelectedAircraftId(evaluation.targetAircraftId);
      }
      setControlError(evaluation.message);
      if (evaluation.openControlPanel) {
        setControlPanelOpen(true);
      }
      return;
    }

    setSelectedAircraftId(evaluation.aircraftId);
    applyProcedureToAircraft(evaluation.aircraftId, evaluation.kind, evaluation.procedure, {
      verticalProcedureMode: evaluation.verticalProcedureMode
    });
  }

  return {
    handleAdHocHoldFixCommand,
    handleAdHocHoldNowCommand,
    handleDirectToFix,
    handleProcedureMenuAction,
    handlePublishedHoldCommand
  };
}
