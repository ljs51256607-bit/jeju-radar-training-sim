import type {
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent
} from "react";
import AircraftControlPanel from "./AircraftControlPanel";
import type {
  AircraftControlField,
  AircraftControlForm
} from "../lib/aircraftControlPanel";
import {
  formatCurrentAltitude,
  formatGuidanceProfileStatus,
  formatHeading,
  formatProcedureAuthorityLabel,
  trueToMagneticHeading
} from "../lib/aircraftControlPanel";
import {
  frequencyStateLabel
} from "../lib/aircraftFrequency";
import {
  formatAircraftVerticalProcedureMode,
  ownerPosition
} from "../lib/aircraftInteraction";
import type { AircraftState } from "../lib/types";
import type {
  RadioQueueAction,
  RadioQueueRow
} from "../lib/radioQueueViewModel";

interface SelectedAircraftControlPanelProps {
  aircraft: AircraftState;
  airportMagVar?: string;
  controlError: string | null;
  controlForm: AircraftControlForm;
  magneticVariationWestDeg: number;
  onAdHocHoldFixCommand: (aircraftId: string, fixId: string, closePanel: boolean) => void;
  onAdHocHoldNowCommand: (aircraftId: string, closePanel: boolean) => void;
  onClose: () => void;
  onControlFormChange: (field: AircraftControlField, value: string) => void;
  onExpediteDescentCommand: () => void;
  onFormKeyDown: (event: ReactKeyboardEvent<HTMLFormElement>) => void;
  onFormSubmit: (event: ReactFormEvent<HTMLFormElement>) => void;
  onPublishedHoldCommand: (
    aircraftId: string,
    altitude: string,
    speed: string,
    closePanel: boolean
  ) => void;
  onRadioQueueAction?: (action: RadioQueueAction) => void;
  onResumeNormalCommand: (mode: "speed" | "climb" | "descent") => void;
  onVerticalProcedureModeCommand: (mode: "des_via" | "cancel_level") => void;
  publishedHoldFixId: string | null;
  radioQueueActionsDisabled?: boolean;
  radioQueueRow?: RadioQueueRow | null;
}

export default function SelectedAircraftControlPanel({
  aircraft,
  airportMagVar,
  controlError,
  controlForm,
  magneticVariationWestDeg,
  onAdHocHoldFixCommand,
  onAdHocHoldNowCommand,
  onClose,
  onControlFormChange,
  onExpediteDescentCommand,
  onFormKeyDown,
  onFormSubmit,
  onPublishedHoldCommand,
  onRadioQueueAction,
  onResumeNormalCommand,
  onVerticalProcedureModeCommand,
  publishedHoldFixId,
  radioQueueActionsDisabled = false,
  radioQueueRow
}: SelectedAircraftControlPanelProps) {
  return (
    <AircraftControlPanel
      aircraft={aircraft}
      controlError={controlError}
      controlForm={controlForm}
      currentAltitudeLabel={formatCurrentAltitude(aircraft.altitude_ft)}
      currentHeadingLabel={`CUR HDG ${formatHeading(
        trueToMagneticHeading(aircraft.heading_true_deg, magneticVariationWestDeg)
      )}M`}
      frequencyLabel={`FREQ ${frequencyStateLabel(aircraft)}`}
      guidanceStatusLabel={formatGuidanceProfileStatus(aircraft)}
      magneticVariationLabel={`VAR ${airportMagVar ?? "0°"}`}
      onClose={onClose}
      onControlFormChange={onControlFormChange}
      onExpediteDescentCommand={onExpediteDescentCommand}
      onFormKeyDown={onFormKeyDown}
      onFormSubmit={onFormSubmit}
      onAdHocHoldFixCommand={() => onAdHocHoldFixCommand(aircraft.id, "", false)}
      onAdHocHoldNowCommand={() => onAdHocHoldNowCommand(aircraft.id, false)}
      onPublishedHoldCommand={() => onPublishedHoldCommand(aircraft.id, "", "", false)}
      onRadioQueueAction={onRadioQueueAction}
      onResumeNormalCommand={onResumeNormalCommand}
      onVerticalProcedureModeCommand={onVerticalProcedureModeCommand}
      ownerPositionLabel={ownerPosition(aircraft)}
      publishedHoldFixId={publishedHoldFixId}
      radioQueueRow={radioQueueRow}
      procedureAuthorityLabel={formatProcedureAuthorityLabel(aircraft)}
      verticalModeLabel={`VERT ${formatAircraftVerticalProcedureMode(aircraft)}`}
      radioQueueActionsDisabled={radioQueueActionsDisabled}
    />
  );
}
