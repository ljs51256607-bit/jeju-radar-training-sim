import type {
  Dispatch,
  FormEvent as ReactFormEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  SetStateAction
} from "react";
import {
  quickAltitudePresetDatalistId,
  quickAltitudePresetOptions,
  type AircraftTextMenuState
} from "../lib/radarAircraftMenu";
import type { AircraftQuickCommandField, ProcedureMenuAction } from "../lib/types";
import RadarTextCommandEntryForm from "./RadarTextCommandEntryForm";
import RadarTextMenuCommandPanel from "./RadarTextMenuCommandPanel";

interface RadarTextMenuProps {
  aircraftTextMenu: AircraftTextMenuState;
  aircraftTextMenuProcedureActions: ProcedureMenuAction[];
  onApplyAircraftCommand: (
    aircraftId: string,
    field: AircraftQuickCommandField,
    value: string
  ) => void;
  onApplyPublishedHold: (
    aircraftId: string,
    altitude: string,
    speed: string
  ) => void;
  onApplyAdHocHoldFix: (aircraftId: string, fixId: string) => void;
  onApplyAdHocHoldNow: (aircraftId: string) => void;
  onAssignProcedureAction: (aircraftId: string, action: ProcedureMenuAction) => void;
  onBeginAircraftMenuCommand: (
    event: ReactMouseEvent<HTMLButtonElement>,
    field: AircraftQuickCommandField,
    label: string
  ) => void;
  onClearAircraftText: (aircraftId: string) => void;
  onCommitAircraftCommandMenu: () => void;
  onCommitAircraftTextMenu: () => void;
  publishedHoldFixId: string | null;
  quickAltitudeManualInputRef: MutableRefObject<boolean>;
  setAircraftTextMenu: Dispatch<SetStateAction<AircraftTextMenuState | null>>;
}

export default function RadarTextMenu({
  aircraftTextMenu,
  aircraftTextMenuProcedureActions,
  onApplyAircraftCommand,
  onApplyPublishedHold,
  onApplyAdHocHoldFix,
  onApplyAdHocHoldNow,
  onAssignProcedureAction,
  onBeginAircraftMenuCommand,
  onClearAircraftText,
  onCommitAircraftCommandMenu,
  onCommitAircraftTextMenu,
  publishedHoldFixId,
  quickAltitudeManualInputRef,
  setAircraftTextMenu
}: RadarTextMenuProps) {
  function submitAircraftTextMenu(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();
    onCommitAircraftTextMenu();
  }

  return (
    <div
      className="radar-text-menu"
      onClick={(event) => {
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.stopPropagation();
      }}
      style={{
        left: `${aircraftTextMenu.x}px`,
        top: `${aircraftTextMenu.y}px`
      }}
    >
      {aircraftTextMenu.mode === "menu" ? (
        <RadarTextMenuCommandPanel
          aircraftTextMenu={aircraftTextMenu}
          aircraftTextMenuProcedureActions={aircraftTextMenuProcedureActions}
          onApplyAdHocHoldFix={onApplyAdHocHoldFix}
          onApplyAdHocHoldNow={onApplyAdHocHoldNow}
          onApplyPublishedHold={onApplyPublishedHold}
          onAssignProcedureAction={onAssignProcedureAction}
          onBeginAircraftMenuCommand={onBeginAircraftMenuCommand}
          onClearAircraftText={onClearAircraftText}
          publishedHoldFixId={publishedHoldFixId}
          setAircraftTextMenu={setAircraftTextMenu}
        />
      ) : aircraftTextMenu.mode === "entry" ? (
        <form onSubmit={submitAircraftTextMenu}>
          <input
            autoFocus
            aria-label="Aircraft text"
            onChange={(event) =>
              setAircraftTextMenu((currentMenu) =>
                currentMenu ? { ...currentMenu, value: event.target.value } : currentMenu
              )
            }
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
                onCommitAircraftTextMenu();
              }
            }}
            value={aircraftTextMenu.value}
          />
        </form>
      ) : (
        <RadarTextCommandEntryForm
          aircraftTextMenu={aircraftTextMenu}
          onApplyAircraftCommand={onApplyAircraftCommand}
          onCommitAircraftCommandMenu={onCommitAircraftCommandMenu}
          quickAltitudeManualInputRef={quickAltitudeManualInputRef}
          setAircraftTextMenu={setAircraftTextMenu}
        />
      )}
      <datalist id={quickAltitudePresetDatalistId}>
        {quickAltitudePresetOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  );
}
