import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent
} from "react";
import {
  aircraftMenuCommandInitialValue,
  aircraftProcedureMenuActions,
  publishedHoldMenuFixId,
  type AircraftTextMenuState
} from "../lib/radarAircraftMenu";
import {
  formatHeading,
  trueToMagneticHeading
} from "../lib/radarMapViewModel";
import type {
  AircraftQuickCommandField,
  AircraftState,
  ProcedureMenuAction
} from "../lib/types";

interface UseRadarAircraftTextMenuOptions {
  aircraft: AircraftState[];
  clientPointToShellPoint: (
    clientX: number,
    clientY: number
  ) => { x: number; y: number } | null;
  magneticVariationWestDeg: number;
  onApplyAircraftCommand: (
    aircraftId: string,
    field: AircraftQuickCommandField,
    value: string
  ) => void;
  onSelectAircraft: (aircraftId: string) => void;
  onSetAircraftText: (aircraftId: string, value: string) => void;
}

export function useRadarAircraftTextMenu({
  aircraft,
  clientPointToShellPoint,
  magneticVariationWestDeg,
  onApplyAircraftCommand,
  onSelectAircraft,
  onSetAircraftText
}: UseRadarAircraftTextMenuOptions) {
  const [aircraftTextMenu, setAircraftTextMenu] = useState<AircraftTextMenuState | null>(null);
  const quickAltitudeManualInputRef = useRef(false);
  const aircraftTextMenuTarget = aircraftTextMenu
    ? aircraft.find((target) => target.id === aircraftTextMenu.aircraftId) ?? null
    : null;
  const aircraftTextMenuProcedureActions =
    aircraftProcedureMenuActions(aircraftTextMenuTarget);
  const aircraftTextMenuPublishedHoldFixId = publishedHoldMenuFixId(aircraftTextMenuTarget);

  useEffect(() => {
    if (!aircraftTextMenu) {
      return;
    }

    if (aircraft.some((target) => target.id === aircraftTextMenu.aircraftId)) {
      return;
    }

    setAircraftTextMenu(null);
  }, [aircraft, aircraftTextMenu]);

  function closeAircraftTextMenu() {
    setAircraftTextMenu(null);
  }

  function handleCallsignPointerDown(event: ReactPointerEvent<SVGElement>) {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
  }

  function handleCallsignClick(event: ReactMouseEvent<SVGElement>) {
    event.stopPropagation();
  }

  function handleCallsignDoubleClick(event: ReactMouseEvent<SVGElement>, target: AircraftState) {
    if (event.button !== 0) {
      return;
    }

    const shellPoint = clientPointToShellPoint(event.clientX, event.clientY);

    if (!shellPoint) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onSelectAircraft(target.id);
    setAircraftTextMenu({
      aircraftId: target.id,
      mode: "menu",
      value: target.scratchpad ?? "",
      x: shellPoint.x,
      y: shellPoint.y
    });
  }

  function commitAircraftTextMenu() {
    if (!aircraftTextMenu) {
      return;
    }

    onSetAircraftText(aircraftTextMenu.aircraftId, aircraftTextMenu.value);
    setAircraftTextMenu(null);
  }

  function beginAircraftMenuCommand(
    event: ReactMouseEvent<HTMLButtonElement>,
    field: AircraftQuickCommandField,
    label: string
  ) {
    if (!aircraftTextMenu || !aircraftTextMenuTarget) {
      return;
    }

    event.stopPropagation();
    const initialValue = aircraftMenuCommandInitialValue(
      aircraftTextMenuTarget,
      field,
      magneticVariationWestDeg,
      { formatHeading, trueToMagneticHeading }
    );
    quickAltitudeManualInputRef.current = false;
    setAircraftTextMenu({
      ...aircraftTextMenu,
      mode: "command",
      commandField: field,
      commandLabel: label,
      placeholder: field === "altitude" ? initialValue : undefined,
      value: field === "altitude" ? "" : initialValue
    });
  }

  function commitAircraftCommandMenu() {
    if (!aircraftTextMenu?.commandField) {
      return;
    }

    onApplyAircraftCommand(
      aircraftTextMenu.aircraftId,
      aircraftTextMenu.commandField,
      aircraftTextMenu.value
    );
    setAircraftTextMenu(null);
  }

  return {
    aircraftTextMenu,
    aircraftTextMenuProcedureActions,
    aircraftTextMenuPublishedHoldFixId,
    beginAircraftMenuCommand,
    closeAircraftTextMenu,
    commitAircraftCommandMenu,
    commitAircraftTextMenu,
    handleCallsignClick,
    handleCallsignDoubleClick,
    handleCallsignPointerDown,
    quickAltitudeManualInputRef,
    setAircraftTextMenu
  };
}
