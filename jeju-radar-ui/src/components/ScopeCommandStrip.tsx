import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  Ref
} from "react";
import type { AtcSpeechStatus } from "../lib/atcSpeechClient";
import type { AtcConsoleResult } from "../lib/atcConsoleViewModel";
import type { AircraftControlField } from "../lib/aircraftControlPanel";

const commandFieldButtons: Array<{ field: AircraftControlField; label: string }> = [
  { field: "heading", label: "H" },
  { field: "speed", label: "S" },
  { field: "altitude", label: "A" },
  { field: "verticalRate", label: "V" }
];

interface ScopeCommandStripProps {
  atcCommandInputRef: Ref<HTMLInputElement>;
  atcCommandText: string;
  atcConsoleResult: AtcConsoleResult;
  atcSpeechState: AtcSpeechStatus;
  onCommandInputKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onCommandTextChange: (value: string) => void;
  onFocusControlField: (field: AircraftControlField) => void;
  onOpenControlPanel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onTogglePushToTalkRecording: () => void;
  selectedAircraftLabel: string | null;
}

export default function ScopeCommandStrip({
  atcCommandInputRef,
  atcCommandText,
  atcConsoleResult,
  atcSpeechState,
  onCommandInputKeyDown,
  onCommandTextChange,
  onFocusControlField,
  onOpenControlPanel,
  onSubmit,
  onTogglePushToTalkRecording,
  selectedAircraftLabel
}: ScopeCommandStripProps) {
  return (
    <form className="scope-command-strip" data-testid="scope-command-strip" onSubmit={onSubmit}>
      <span className={`scope-command-status ${atcConsoleResult.status}`}>ATC</span>
      <input
        aria-label="Scope command strip ATC command"
        data-testid="scope-command-strip-input"
        placeholder="CALLSIGN instruction"
        ref={atcCommandInputRef}
        value={atcCommandText}
        onChange={(event) => onCommandTextChange(event.target.value)}
        onKeyDown={onCommandInputKeyDown}
      />
      <button data-testid="scope-command-strip-submit" type="submit">
        SEND
      </button>
      <button
        className={`scope-command-ptt ${atcSpeechState}`}
        data-testid="scope-command-strip-ptt"
        onClick={onTogglePushToTalkRecording}
        type="button"
      >
        {atcSpeechState === "recording" ? "REC" : "PTT"}
      </button>
      <button
        className="scope-command-selected"
        data-testid="scope-command-strip-selected"
        disabled={!selectedAircraftLabel}
        onClick={onOpenControlPanel}
        type="button"
      >
        {selectedAircraftLabel ?? "NO SEL"}
      </button>
      <div className="scope-command-fields" aria-label="Selected aircraft command fields">
        {commandFieldButtons.map((button) => (
          <button
            aria-label={`${button.field} command field`}
            disabled={!selectedAircraftLabel}
            key={button.field}
            onClick={() => onFocusControlField(button.field)}
            type="button"
          >
            {button.label}
          </button>
        ))}
      </div>
    </form>
  );
}
