import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from "react";
import {
  atcConsoleResultFromPilotResponse,
  radioExchangePhaseBlocksPilotFirstContact,
  type AtcConsoleResult
} from "../lib/atcConsoleViewModel";
import {
  evaluatePilotFirstContactBatch
} from "../lib/pilotFirstContact";
import {
  pilotResponseForFirstContact,
  pilotResponseForRadioJamming
} from "../lib/pilotResponseLayer";
import type {
  AircraftState,
  RadarDataset
} from "../lib/types";

interface UsePilotFirstContactMonitorOptions {
  aircraftTraffic: AircraftState[];
  atcConsoleResult: AtcConsoleResult;
  dataset: RadarDataset | null;
  radarPaused: boolean;
  setAircraftTraffic: Dispatch<SetStateAction<AircraftState[]>>;
  setAtcConsoleResult: Dispatch<SetStateAction<AtcConsoleResult>>;
  setSelectedAircraftId: Dispatch<SetStateAction<string | null>>;
  simulationTimeRef: MutableRefObject<number>;
}

export function usePilotFirstContactMonitor({
  aircraftTraffic,
  atcConsoleResult,
  dataset,
  radarPaused,
  setAircraftTraffic,
  setAtcConsoleResult,
  setSelectedAircraftId,
  simulationTimeRef
}: UsePilotFirstContactMonitorOptions) {
  useEffect(() => {
    if (radarPaused || !dataset || aircraftTraffic.length === 0) {
      return;
    }

    const firstContactResult = evaluatePilotFirstContactBatch(
      aircraftTraffic,
      dataset,
      simulationTimeRef.current,
      {
        radioExchangeBusy: radioExchangePhaseBlocksPilotFirstContact(
          atcConsoleResult.radio_exchange_phase
        )
      }
    );

    if (firstContactResult.status === "none") {
      return;
    }

    setAircraftTraffic(firstContactResult.aircraftTraffic);

    if (firstContactResult.status === "jammed") {
      setSelectedAircraftId(firstContactResult.event.aircraftIds[0] ?? null);
      setAtcConsoleResult(
        atcConsoleResultFromPilotResponse(
          pilotResponseForRadioJamming(
            firstContactResult.event.text,
            firstContactResult.event.detail
          )
        )
      );
      return;
    }

    setSelectedAircraftId(firstContactResult.event.aircraftId);
    setAtcConsoleResult(
      atcConsoleResultFromPilotResponse(
        pilotResponseForFirstContact(
          firstContactResult.event.callsign,
          firstContactResult.event.text,
          firstContactResult.event.detail
        )
      )
    );
  }, [
    aircraftTraffic,
    atcConsoleResult.radio_exchange_phase,
    dataset,
    radarPaused,
    setAircraftTraffic,
    setAtcConsoleResult,
    setSelectedAircraftId,
    simulationTimeRef
  ]);
}
