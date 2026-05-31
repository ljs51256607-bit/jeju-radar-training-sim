import type {
  Dispatch,
  FormEvent as ReactFormEvent,
  MutableRefObject,
  SetStateAction
} from "react";
import {
  quickAltitudePresetDatalistId,
  quickAltitudePresetOptions,
  type AircraftTextMenuState
} from "../lib/radarAircraftMenu";
import type { AircraftQuickCommandField } from "../lib/types";

interface RadarTextCommandEntryFormProps {
  aircraftTextMenu: AircraftTextMenuState;
  onApplyAircraftCommand: (
    aircraftId: string,
    field: AircraftQuickCommandField,
    value: string
  ) => void;
  onCommitAircraftCommandMenu: () => void;
  quickAltitudeManualInputRef: MutableRefObject<boolean>;
  setAircraftTextMenu: Dispatch<SetStateAction<AircraftTextMenuState | null>>;
}

export default function RadarTextCommandEntryForm({
  aircraftTextMenu,
  onApplyAircraftCommand,
  onCommitAircraftCommandMenu,
  quickAltitudeManualInputRef,
  setAircraftTextMenu
}: RadarTextCommandEntryFormProps) {
  function submitAircraftCommandMenu(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    onCommitAircraftCommandMenu();
  }

  function openAltitudePresetPicker(input: HTMLInputElement & { showPicker?: () => void }) {
    if (aircraftTextMenu.commandField !== "altitude") {
      return;
    }

    quickAltitudeManualInputRef.current = false;

    try {
      input.showPicker?.();
    } catch {
      // Native datalist remains usable even when showPicker is blocked.
    }
  }

  return (
    <form className="radar-command-entry" onSubmit={submitAircraftCommandMenu}>
      <span>{aircraftTextMenu.commandLabel ?? "CMD"}</span>
      <input
        autoFocus
        aria-label={`${aircraftTextMenu.commandLabel ?? "Aircraft command"} command`}
        list={
          aircraftTextMenu.commandField === "altitude"
            ? quickAltitudePresetDatalistId
            : undefined
        }
        placeholder={aircraftTextMenu.placeholder}
        onChange={(event) => {
          const nextValue = event.target.value.toUpperCase();
          const isAltitudePreset =
            aircraftTextMenu.commandField === "altitude" &&
            quickAltitudePresetOptions.includes(nextValue);

          if (isAltitudePreset && !quickAltitudeManualInputRef.current) {
            onApplyAircraftCommand(aircraftTextMenu.aircraftId, "altitude", nextValue);
            setAircraftTextMenu(null);
            return;
          }

          setAircraftTextMenu((currentMenu) =>
            currentMenu ? { ...currentMenu, value: nextValue } : currentMenu
          );
        }}
        onClick={(event) => openAltitudePresetPicker(event.currentTarget)}
        onFocus={(event) => {
          event.currentTarget.select();
          openAltitudePresetPicker(event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setAircraftTextMenu(null);
            return;
          }

          if (event.key === "Enter") {
            event.preventDefault();
            event.stopPropagation();
            onCommitAircraftCommandMenu();
            return;
          }

          if (aircraftTextMenu.commandField === "altitude" && event.key.length === 1) {
            quickAltitudeManualInputRef.current = true;
          }
        }}
        value={aircraftTextMenu.value}
      />
    </form>
  );
}
