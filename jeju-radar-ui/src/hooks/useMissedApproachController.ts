import {
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction
} from "react";
import {
  aircraftControlFormFromState,
  type AircraftControlField,
  type AircraftControlForm
} from "../lib/aircraftControlPanel";
import {
  atcConsoleResultFromPilotResponse,
  type AtcConsoleResult
} from "../lib/atcConsoleViewModel";
import {
  applyMissedApproachCandidate,
  applyMissedApproachForAircraft,
  automaticMissedApproachCandidate,
  missedApproachEvaluationKey,
  missedApproachProbabilityHit,
  normalizeMissedApproachProbability,
  type MissedApproachEvent
} from "../lib/missedApproachRuntime";
import { pilotResponseForMissedApproachReport } from "../lib/pilotResponseLayer";
import { sanitizeCallsignInput } from "../lib/scenarioTraffic";
import type {
  AircraftState,
  RadarDataset
} from "../lib/types";

interface UseMissedApproachControllerOptions {
  aircraftTraffic: AircraftState[];
  dataset: RadarDataset | null;
  getSimulationNowMs: () => number;
  magneticVariationWestDeg: number;
  missedApproachProbability: string | number;
  radarPaused: boolean;
  retimeDepartureFlowAfterMissedApproach: (event: MissedApproachEvent) => void;
  selectedAircraftId: string | null;
  setAircraftTraffic: Dispatch<SetStateAction<AircraftState[]>>;
  setAtcConsoleResult: Dispatch<SetStateAction<AtcConsoleResult>>;
  setControlForm: Dispatch<SetStateAction<AircraftControlForm>>;
  setLastEditedControlField: Dispatch<SetStateAction<AircraftControlField | null>>;
  setScenarioError: Dispatch<SetStateAction<string | null>>;
  setSelectedAircraftId: Dispatch<SetStateAction<string | null>>;
}

export function useMissedApproachController({
  aircraftTraffic,
  dataset,
  getSimulationNowMs,
  magneticVariationWestDeg,
  missedApproachProbability,
  radarPaused,
  retimeDepartureFlowAfterMissedApproach,
  selectedAircraftId,
  setAircraftTraffic,
  setAtcConsoleResult,
  setControlForm,
  setLastEditedControlField,
  setScenarioError,
  setSelectedAircraftId
}: UseMissedApproachControllerOptions) {
  const missedApproachEvaluationKeysRef = useRef<Set<string>>(new Set());

  function setMissedApproachConsoleEvent(event: MissedApproachEvent) {
    setAtcConsoleResult(
      atcConsoleResultFromPilotResponse(
        pilotResponseForMissedApproachReport(
          sanitizeCallsignInput(event.aircraft.callsign),
          event.report_text,
          event.detail
        )
      )
    );
  }

  useEffect(() => {
    if (radarPaused || !dataset || aircraftTraffic.length === 0) {
      return;
    }

    const probabilityPercent = normalizeMissedApproachProbability(missedApproachProbability);

    if (probabilityPercent <= 0) {
      return;
    }

    let missedApproachEvent: MissedApproachEvent | null = null;
    const currentTimeMs = getSimulationNowMs();
    const updatedAircraft = aircraftTraffic.map((aircraft) => {
      if (missedApproachEvent) {
        return aircraft;
      }

      const candidate = automaticMissedApproachCandidate({
        aircraft,
        dataset,
        probabilityPercent,
        currentTimeMs
      });

      if (!candidate) {
        return aircraft;
      }

      const evaluationKey = missedApproachEvaluationKey(candidate);

      if (missedApproachEvaluationKeysRef.current.has(evaluationKey)) {
        return aircraft;
      }

      missedApproachEvaluationKeysRef.current.add(evaluationKey);

      if (!missedApproachProbabilityHit(candidate)) {
        return aircraft;
      }

      missedApproachEvent = applyMissedApproachCandidate(candidate);

      return missedApproachEvent?.aircraft ?? aircraft;
    });

    if (!missedApproachEvent) {
      return;
    }

    setAircraftTraffic(updatedAircraft);
    setSelectedAircraftId(missedApproachEvent.aircraft.id);
    setMissedApproachConsoleEvent(missedApproachEvent);
    retimeDepartureFlowAfterMissedApproach(missedApproachEvent);
  }, [
    aircraftTraffic,
    dataset,
    getSimulationNowMs,
    missedApproachProbability,
    radarPaused,
    retimeDepartureFlowAfterMissedApproach,
    setAircraftTraffic,
    setSelectedAircraftId
  ]);

  function handleForceMissedApproach() {
    if (!dataset) {
      return;
    }

    if (!selectedAircraftId) {
      setScenarioError("복행시킬 항공기를 먼저 선택해야 함");
      return;
    }

    const targetAircraft = aircraftTraffic.find((aircraft) => aircraft.id === selectedAircraftId);

    if (!targetAircraft) {
      setScenarioError("선택 항공기를 찾을 수 없음");
      return;
    }

    const result = applyMissedApproachForAircraft({
      aircraft: targetAircraft,
      dataset,
      currentTimeMs: getSimulationNowMs()
    });

    if ("error" in result) {
      setScenarioError(result.error);
      return;
    }

    setAircraftTraffic((currentAircraft) =>
      currentAircraft.map((aircraft) =>
        aircraft.id === result.aircraft.id ? result.aircraft : aircraft
      )
    );
    missedApproachEvaluationKeysRef.current.add(
      [
        result.aircraft.id,
        result.profile.id,
        targetAircraft.procedure_id ?? "",
        targetAircraft.guidance_active_at_ms ?? 0
      ].join(":")
    );
    setSelectedAircraftId(result.aircraft.id);
    setControlForm(aircraftControlFormFromState(result.aircraft, magneticVariationWestDeg));
    setLastEditedControlField(null);
    setScenarioError(null);
    setMissedApproachConsoleEvent(result);
    retimeDepartureFlowAfterMissedApproach(result);
  }

  return {
    handleForceMissedApproach
  };
}
