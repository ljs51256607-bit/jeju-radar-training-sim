import {
  useEffect,
  type Dispatch,
  type SetStateAction
} from "react";
import {
  aircraftControlFormsEqual,
  aircraftControlFormWithAssignedValues,
  parseMagneticVariationWestDeg,
  type AircraftControlField,
  type AircraftControlForm
} from "../lib/aircraftControlPanel";
import type {
  AircraftState,
  RadarDataset
} from "../lib/types";

interface UseSelectedAircraftControlFormSyncOptions {
  aircraftTraffic: AircraftState[];
  controlPanelOpen: boolean;
  dataset: RadarDataset | null;
  lastEditedControlField: AircraftControlField | null;
  selectedAircraftId: string | null;
  setControlForm: Dispatch<SetStateAction<AircraftControlForm>>;
}

export function useSelectedAircraftControlFormSync({
  aircraftTraffic,
  controlPanelOpen,
  dataset,
  lastEditedControlField,
  selectedAircraftId,
  setControlForm
}: UseSelectedAircraftControlFormSyncOptions) {
  useEffect(() => {
    if (!controlPanelOpen || !selectedAircraftId || !dataset) {
      return;
    }

    const selectedAircraftForForm = aircraftTraffic.find(
      (aircraft) => aircraft.id === selectedAircraftId
    );

    if (!selectedAircraftForForm) {
      return;
    }

    const magneticVariationWestDeg = parseMagneticVariationWestDeg(
      dataset.airport.airport_meta.mag_var
    );

    setControlForm((currentForm) => {
      const nextForm = aircraftControlFormWithAssignedValues(
        currentForm,
        selectedAircraftForForm,
        magneticVariationWestDeg,
        lastEditedControlField
      );

      return aircraftControlFormsEqual(currentForm, nextForm) ? currentForm : nextForm;
    });
  }, [
    aircraftTraffic,
    controlPanelOpen,
    dataset,
    lastEditedControlField,
    selectedAircraftId,
    setControlForm
  ]);
}
