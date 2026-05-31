import type {
  Dispatch,
  SetStateAction
} from "react";
import {
  aircraftControlFormFromState,
  parseMagneticVariationWestDeg,
  type AircraftControlField,
  type AircraftControlForm
} from "../lib/aircraftControlPanel";
import type {
  AircraftState,
  RadarDataset
} from "../lib/types";

interface UseAircraftSelectionControllerOptions {
  aircraftTraffic: AircraftState[];
  closeScenarioStoragePanel: () => void;
  dataset: RadarDataset | null;
  resetAircraftCreateUi: () => void;
  setControlError: Dispatch<SetStateAction<string | null>>;
  setControlForm: Dispatch<SetStateAction<AircraftControlForm>>;
  setControlPanelOpen: Dispatch<SetStateAction<boolean>>;
  setLastEditedControlField: Dispatch<SetStateAction<AircraftControlField | null>>;
  setScenarioPanelOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedAircraftId: Dispatch<SetStateAction<string | null>>;
}

export function useAircraftSelectionController({
  aircraftTraffic,
  closeScenarioStoragePanel,
  dataset,
  resetAircraftCreateUi,
  setControlError,
  setControlForm,
  setControlPanelOpen,
  setLastEditedControlField,
  setScenarioPanelOpen,
  setSelectedAircraftId
}: UseAircraftSelectionControllerOptions) {
  function handleSelectAircraft(aircraftId: string) {
    const aircraft = aircraftTraffic.find((candidate) => candidate.id === aircraftId);
    const magneticVariationWestDeg = dataset
      ? parseMagneticVariationWestDeg(dataset.airport.airport_meta.mag_var)
      : 0;

    setSelectedAircraftId(aircraftId);
    setControlError(null);
    resetAircraftCreateUi();
    setScenarioPanelOpen(false);
    closeScenarioStoragePanel();

    if (aircraft) {
      setControlForm(aircraftControlFormFromState(aircraft, magneticVariationWestDeg));
      setLastEditedControlField(null);
      setControlPanelOpen(true);
    }
  }

  return {
    handleSelectAircraft
  };
}
