import {
  useEffect,
  type Dispatch,
  type SetStateAction
} from "react";
import {
  runwayIdVisibleForRunwayMode
} from "../lib/scenarioTraffic";
import type {
  AircraftState,
  RadarDataset,
  RunwayMode
} from "../lib/types";

interface UseRunwaySelectedAircraftGuardOptions {
  aircraftTraffic: AircraftState[];
  dataset: RadarDataset | null;
  selectedAircraftId: string | null;
  selectedRunway: RunwayMode;
  setControlPanelOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedAircraftId: Dispatch<SetStateAction<string | null>>;
}

export function useRunwaySelectedAircraftGuard({
  aircraftTraffic,
  dataset,
  selectedAircraftId,
  selectedRunway,
  setControlPanelOpen,
  setSelectedAircraftId
}: UseRunwaySelectedAircraftGuardOptions) {
  useEffect(() => {
    if (!dataset) {
      return;
    }

    const runwayMatchedAircraft = aircraftTraffic.filter((aircraft) =>
      runwayIdVisibleForRunwayMode(aircraft.target_runway, selectedRunway)
    );

    if (runwayMatchedAircraft.length === 0) {
      setSelectedAircraftId(null);
      setControlPanelOpen(false);
      return;
    }

    if (!runwayMatchedAircraft.some((aircraft) => aircraft.id === selectedAircraftId)) {
      setSelectedAircraftId(runwayMatchedAircraft[0].id);
    }
  }, [
    aircraftTraffic,
    dataset,
    selectedAircraftId,
    selectedRunway,
    setControlPanelOpen,
    setSelectedAircraftId
  ]);
}
