import type { ParsedAtcCommand } from "./atcCommandParser";
import { trueToMagneticHeading } from "./aircraftControlPanel";
import type { AircraftState } from "./types";

export function parsedCommandWithHoldReadbackContext(
  parsed: ParsedAtcCommand,
  aircraft: AircraftState,
  magneticVariationWestDeg: number
): ParsedAtcCommand {
  if (
    parsed.intent !== "HOLD_AT_FIX" ||
    parsed.slots.hold_at_present_position !== true ||
    typeof parsed.slots.inbound_heading_deg === "number"
  ) {
    return parsed;
  }

  return {
    ...parsed,
    slots: {
      ...parsed.slots,
      inbound_heading_deg: Math.round(
        trueToMagneticHeading(aircraft.heading_true_deg, magneticVariationWestDeg)
      )
    }
  };
}

export function parsedCommandsWithHoldReadbackContext(
  commands: ParsedAtcCommand[],
  aircraft: AircraftState,
  magneticVariationWestDeg: number
) {
  return commands.map((command) =>
    parsedCommandWithHoldReadbackContext(command, aircraft, magneticVariationWestDeg)
  );
}
