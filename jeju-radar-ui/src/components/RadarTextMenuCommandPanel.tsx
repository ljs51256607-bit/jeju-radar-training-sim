import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  SetStateAction
} from "react";
import {
  procedureMenuActionLabel,
  quickCommandButtons,
  type AircraftTextMenuState
} from "../lib/radarAircraftMenu";
import type {
  AircraftQuickCommandField,
  ProcedureMenuAction
} from "../lib/types";

interface RadarTextMenuCommandPanelProps {
  aircraftTextMenu: AircraftTextMenuState;
  aircraftTextMenuProcedureActions: ProcedureMenuAction[];
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
  publishedHoldFixId: string | null;
  setAircraftTextMenu: Dispatch<SetStateAction<AircraftTextMenuState | null>>;
}

export default function RadarTextMenuCommandPanel({
  aircraftTextMenu,
  aircraftTextMenuProcedureActions,
  onApplyPublishedHold,
  onApplyAdHocHoldFix,
  onApplyAdHocHoldNow,
  onAssignProcedureAction,
  onBeginAircraftMenuCommand,
  onClearAircraftText,
  publishedHoldFixId,
  setAircraftTextMenu
}: RadarTextMenuCommandPanelProps) {
  function closeAfter(event: ReactMouseEvent<HTMLButtonElement>, callback: () => void) {
    event.stopPropagation();
    callback();
    setAircraftTextMenu(null);
  }

  function handleAircraftProcedureMenuAction(
    event: ReactMouseEvent<HTMLButtonElement>,
    action: ProcedureMenuAction
  ) {
    closeAfter(event, () => onAssignProcedureAction(aircraftTextMenu.aircraftId, action));
  }

  return (
    <>
      <div className="radar-command-grid" aria-label="Aircraft quick commands">
        {quickCommandButtons.map((command) => (
          <button
            key={command.field}
            onClick={(event) => onBeginAircraftMenuCommand(event, command.field, command.label)}
            type="button"
          >
            {command.label}
          </button>
        ))}
      </div>
      {publishedHoldFixId ? (
        <div className="radar-command-grid radar-command-grid-hold" aria-label="Published holding command">
          <button
            onClick={(event) =>
              closeAfter(event, () => onApplyPublishedHold(aircraftTextMenu.aircraftId, "", ""))
            }
            type="button"
          >
            HOLD PUB
          </button>
        </div>
      ) : null}
      <div className="radar-command-grid radar-command-grid-hold" aria-label="Ad-hoc holding command">
        <button
          onClick={(event) => closeAfter(event, () => onApplyAdHocHoldNow(aircraftTextMenu.aircraftId))}
          type="button"
        >
          HOLD NOW
        </button>
        <button
          onClick={(event) => closeAfter(event, () => onApplyAdHocHoldFix(aircraftTextMenu.aircraftId, ""))}
          type="button"
        >
          HOLD FIX
        </button>
      </div>
      {aircraftTextMenuProcedureActions.length > 0 ? (
        <div className="radar-text-menu-procedures" aria-label="Procedure actions">
          {aircraftTextMenuProcedureActions.map((action) => (
            <button
              data-procedure-action={action}
              key={action}
              onClick={(event) => handleAircraftProcedureMenuAction(event, action)}
              type="button"
            >
              {procedureMenuActionLabel(action)}
            </button>
          ))}
        </div>
      ) : null}
      <div className="radar-command-grid radar-command-grid-text" aria-label="Aircraft text commands">
        <button
          onClick={(event) => {
            event.stopPropagation();
            setAircraftTextMenu((currentMenu) =>
              currentMenu ? { ...currentMenu, mode: "entry" } : currentMenu
            );
          }}
          type="button"
        >
          TEXT
        </button>
        <button
          onClick={(event) => closeAfter(event, () => onClearAircraftText(aircraftTextMenu.aircraftId))}
          type="button"
        >
          CLR
        </button>
      </div>
    </>
  );
}
