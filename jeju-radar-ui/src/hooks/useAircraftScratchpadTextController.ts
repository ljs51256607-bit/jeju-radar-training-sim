import type {
  Dispatch,
  SetStateAction
} from "react";
import type {
  AircraftControlField,
  AircraftControlForm
} from "../lib/aircraftControlPanel";
import {
  aircraftWithClearedScratchpadText,
  aircraftWithScratchpadText,
  scratchpadTextControlValue
} from "../lib/aircraftTextRuntime";
import type { AircraftState } from "../lib/types";

interface UseAircraftScratchpadTextControllerOptions {
  selectedAircraftId: string | null;
  setAircraftTraffic: Dispatch<SetStateAction<AircraftState[]>>;
  setControlForm: Dispatch<SetStateAction<AircraftControlForm>>;
  setLastEditedControlField: Dispatch<SetStateAction<AircraftControlField | null>>;
}

export function useAircraftScratchpadTextController({
  selectedAircraftId,
  setAircraftTraffic,
  setControlForm,
  setLastEditedControlField
}: UseAircraftScratchpadTextControllerOptions) {
  function handleSetAircraftText(aircraftId: string, value: string) {
    const scratchpad = scratchpadTextControlValue(value);

    setAircraftTraffic((currentAircraft) =>
      currentAircraft.map((aircraft) =>
        aircraft.id === aircraftId ? aircraftWithScratchpadText(aircraft, value) : aircraft
      )
    );

    if (aircraftId === selectedAircraftId) {
      setControlForm((currentForm) => ({
        ...currentForm,
        scratchpad
      }));
      setLastEditedControlField(null);
    }
  }

  function handleClearAircraftText(aircraftId: string) {
    setAircraftTraffic((currentAircraft) =>
      currentAircraft.map((aircraft) =>
        aircraft.id === aircraftId ? aircraftWithClearedScratchpadText(aircraft) : aircraft
      )
    );

    if (aircraftId === selectedAircraftId) {
      setControlForm((currentForm) => ({
        ...currentForm,
        scratchpad: ""
      }));
      setLastEditedControlField(null);
    }
  }

  return {
    handleClearAircraftText,
    handleSetAircraftText
  };
}
