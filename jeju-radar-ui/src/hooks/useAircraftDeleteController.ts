import type {
  Dispatch,
  SetStateAction
} from "react";
import type { AircraftState } from "../lib/types";

interface UseAircraftDeleteControllerOptions {
  aircraftTraffic: AircraftState[];
  selectedAircraftId: string | null;
  setAircraftTraffic: Dispatch<SetStateAction<AircraftState[]>>;
  setControlError: Dispatch<SetStateAction<string | null>>;
  setControlPanelOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedAircraftId: Dispatch<SetStateAction<string | null>>;
}

export function useAircraftDeleteController({
  aircraftTraffic,
  selectedAircraftId,
  setAircraftTraffic,
  setControlError,
  setControlPanelOpen,
  setSelectedAircraftId
}: UseAircraftDeleteControllerOptions) {
  function deleteAircraftWhere(predicate: (aircraft: AircraftState) => boolean) {
    const deletingSelectedAircraft = selectedAircraftId
      ? aircraftTraffic.some((aircraft) => aircraft.id === selectedAircraftId && predicate(aircraft))
      : false;

    setAircraftTraffic((currentAircraft) => currentAircraft.filter((aircraft) => !predicate(aircraft)));

    if (deletingSelectedAircraft) {
      setSelectedAircraftId(null);
      setControlPanelOpen(false);
    }

    setControlError(null);
  }

  return {
    deleteAircraftWhere
  };
}
