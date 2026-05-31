import type {
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent
} from "react";
import GuidanceProfilePanel from "./GuidanceProfilePanel";
import type {
  AircraftControlField,
  AircraftControlForm
} from "../lib/aircraftControlPanel";
import type { AircraftState } from "../lib/types";
import {
  radioQueueActionLabel,
  radioQueueActionsForRow,
  type RadioQueueAction,
  type RadioQueueRow
} from "../lib/radioQueueViewModel";

interface AircraftControlPanelProps {
  aircraft: AircraftState;
  controlError: string | null;
  controlForm: AircraftControlForm;
  currentAltitudeLabel: string;
  currentHeadingLabel: string;
  frequencyLabel: string;
  guidanceStatusLabel: string;
  magneticVariationLabel: string;
  onClose: () => void;
  onControlFormChange: (field: AircraftControlField, value: string) => void;
  onExpediteDescentCommand: () => void;
  onFormKeyDown: (event: ReactKeyboardEvent<HTMLFormElement>) => void;
  onFormSubmit: (event: ReactFormEvent<HTMLFormElement>) => void;
  onAdHocHoldFixCommand: () => void;
  onAdHocHoldNowCommand: () => void;
  onPublishedHoldCommand: () => void;
  onRadioQueueAction?: (action: RadioQueueAction) => void;
  onResumeNormalCommand: (mode: "speed" | "climb" | "descent") => void;
  onVerticalProcedureModeCommand: (mode: "des_via" | "cancel_level") => void;
  ownerPositionLabel: string;
  procedureAuthorityLabel?: string | null;
  publishedHoldFixId: string | null;
  radioQueueActionsDisabled?: boolean;
  radioQueueRow?: RadioQueueRow | null;
  verticalModeLabel: string;
}

export default function AircraftControlPanel({
  aircraft,
  controlError,
  controlForm,
  currentAltitudeLabel,
  currentHeadingLabel,
  frequencyLabel,
  guidanceStatusLabel,
  magneticVariationLabel,
  onClose,
  onControlFormChange,
  onExpediteDescentCommand,
  onFormKeyDown,
  onFormSubmit,
  onAdHocHoldFixCommand,
  onAdHocHoldNowCommand,
  onPublishedHoldCommand,
  onRadioQueueAction,
  onResumeNormalCommand,
  onVerticalProcedureModeCommand,
  ownerPositionLabel,
  procedureAuthorityLabel,
  publishedHoldFixId,
  radioQueueActionsDisabled = false,
  radioQueueRow,
  verticalModeLabel
}: AircraftControlPanelProps) {
  const holdingStatus = holdingStatusLabel(aircraft);
  const radioQueueActions = radioQueueRow ? radioQueueActionsForRow(radioQueueRow) : [];

  return (
    <form
      className="aircraft-control-panel"
      aria-label="Aircraft control panel"
      onKeyDown={onFormKeyDown}
      onSubmit={onFormSubmit}
    >
      <div className="aircraft-control-header">
        <div>
          <span>{aircraft.callsign}</span>
          <strong>
            {aircraft.aircraft_type} {ownerPositionLabel}
          </strong>
        </div>
        <button
          className="aircraft-control-close"
          onClick={onClose}
          type="button"
        >
          X
        </button>
      </div>

      <div className="aircraft-control-state">
        <span>{currentHeadingLabel}</span>
        <span>SPD {Math.round(aircraft.ground_speed_kt)}</span>
        <span>{magneticVariationLabel}</span>
        <span>{frequencyLabel}</span>
        <span>{currentAltitudeLabel}</span>
        <span>{verticalModeLabel}</span>
        <span>{guidanceStatusLabel}</span>
        {procedureAuthorityLabel ? <span>{procedureAuthorityLabel}</span> : null}
        {holdingStatus ? <span>{holdingStatus}</span> : null}
      </div>

      <GuidanceProfilePanel aircraft={aircraft} />

      {radioQueueRow ? (
        <div
          aria-label="Selected aircraft radio queue actions"
          className={`aircraft-radio-row ${radioQueueRow.status.toLowerCase()}`}
          data-selected-radio-queue-status={radioQueueRow.status}
          data-testid="selected-aircraft-radio-queue"
        >
          <span>RADIO {radioQueueRow.status}</span>
          <strong>{radioQueueRow.detail}</strong>
          {radioQueueActions.map((action) => (
            <button
              data-selected-radio-action={action}
              disabled={radioQueueActionsDisabled}
              key={action}
              onClick={() => onRadioQueueAction?.(action)}
              title={`${radioQueueRow.callsign} ${radioQueueActionLabel(action)}`}
              type="button"
            >
              {radioQueueActionLabel(action)}
            </button>
          ))}
        </div>
      ) : null}

      <div className="aircraft-control-grid">
        <label>
          HDG
          <input
            inputMode="numeric"
            name="heading"
            onChange={(event) => onControlFormChange("heading", event.target.value)}
            value={controlForm.heading}
          />
        </label>
        <label>
          SPD
          <input
            inputMode="numeric"
            name="speed"
            onChange={(event) => onControlFormChange("speed", event.target.value)}
            value={controlForm.speed}
          />
        </label>
        <label>
          ALT
          <input
            name="altitude"
            onChange={(event) => onControlFormChange("altitude", event.target.value)}
            value={controlForm.altitude}
          />
        </label>
        <label>
          VS
          <input
            inputMode="numeric"
            name="verticalRate"
            onChange={(event) => onControlFormChange("verticalRate", event.target.value)}
            value={controlForm.verticalRate}
          />
        </label>
      </div>

      <div className="aircraft-resume-row">
        <button onClick={() => onVerticalProcedureModeCommand("des_via")} type="button">
          DES VIA
        </button>
        <button onClick={() => onVerticalProcedureModeCommand("cancel_level")} type="button">
          CXL LVL
        </button>
        <button onClick={() => onResumeNormalCommand("speed")} type="button">
          RES SPD
        </button>
        <button onClick={() => onResumeNormalCommand("climb")} type="button">
          RES CLB
        </button>
        <button onClick={() => onResumeNormalCommand("descent")} type="button">
          RES DES
        </button>
        <button onClick={onExpediteDescentCommand} type="button">
          EXP DES
        </button>
        <button
          onClick={onPublishedHoldCommand}
          title={publishedHoldFixId ? `Hold at ${publishedHoldFixId} as published` : "DCT published holding fix first"}
          type="button"
        >
          HOLD PUB
        </button>
        <button
          onClick={onAdHocHoldNowCommand}
          title="Hold at present position using current assigned altitude and speed"
          type="button"
        >
          HOLD NOW
        </button>
        <button
          onClick={onAdHocHoldFixCommand}
          title="Ad-hoc hold at TEXT fix, or current DCT fix if TEXT is empty"
          type="button"
        >
          HOLD FIX
        </button>
      </div>

      <label className="aircraft-control-scratchpad">
        TEXT
        <input
          name="scratchpad"
          onChange={(event) => onControlFormChange("scratchpad", event.target.value)}
          value={controlForm.scratchpad}
        />
      </label>

      {controlError ? <div className="aircraft-control-error">{controlError}</div> : null}

      <button className="aircraft-control-apply" type="submit">
        APPLY
      </button>
    </form>
  );
}

function holdingStatusLabel(aircraft: AircraftState) {
  const pattern = aircraft.holding_pattern;

  if (!pattern || aircraft.route_mode !== "hold") {
    return null;
  }

  const turn = pattern.turn_direction === "left" ? "L" : "R";
  const course = String(Math.round(pattern.inbound_course_deg)).padStart(3, "0");
  const entry = aircraft.holding_state ? holdingEntryLabel(aircraft.holding_state.entry_type) : null;
  const phase = aircraft.holding_state ? holdingPhaseLabel(aircraft.holding_state.phase) : null;
  const entryPhase = [entry, phase].filter(Boolean).join(" ");

  return `HOLD ${pattern.fix_id} ${course}T ${turn} ${pattern.leg_time_min}M${entryPhase ? ` ${entryPhase}` : ""}`;
}

function holdingEntryLabel(entryType: NonNullable<AircraftState["holding_state"]>["entry_type"]) {
  if (entryType === "parallel") {
    return "PAR";
  }

  if (entryType === "teardrop") {
    return "TD";
  }

  return "DIR";
}

function holdingPhaseLabel(phase: NonNullable<AircraftState["holding_state"]>["phase"]) {
  if (phase === "entry_to_fix") {
    return "TO FIX";
  }

  if (phase === "entry_parallel_outbound" || phase === "entry_teardrop_outbound") {
    return "ENTRY OUT";
  }

  if (phase === "turn_inbound") {
    return "TURN IN";
  }

  return phase.toUpperCase();
}
