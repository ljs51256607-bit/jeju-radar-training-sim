import type { ParsedAtcCommand } from "./atcCommandParser";
import type { AircraftFrequencyState, AircraftState } from "./types";

export function effectiveFrequencyState(aircraft: AircraftState): AircraftFrequencyState {
  if (aircraft.frequency_state) {
    return aircraft.frequency_state;
  }

  if (
    aircraft.pilot_first_contact?.done ||
    aircraft.pilot_first_contact?.awaiting_controller_response
  ) {
    return "first_contacted";
  }

  if (aircraft.pilot_first_contact) {
    return "not_on_frequency";
  }

  return "on_frequency";
}

export function aircraftAcceptsAtcCommands(
  aircraft: AircraftState,
  parsed?: Pick<ParsedAtcCommand, "intent" | "preamble">
) {
  return (
    effectiveFrequencyState(aircraft) !== "not_on_frequency" ||
    aircraftAcceptsFirstContactControllerReply(aircraft, parsed)
  );
}

export function aircraftAcceptsFirstContactControllerReply(
  aircraft: AircraftState,
  parsed?: Pick<ParsedAtcCommand, "intent" | "preamble">
) {
  const firstContact = aircraft.pilot_first_contact;

  if (!firstContact || firstContact.done) {
    return false;
  }

  const hasControllerAddressedFirstContact =
    parsed?.intent === "FIRST_CONTACT_ACK" ||
    parsed?.intent === "RADIO_STANDBY" ||
    Boolean(parsed?.preamble?.present || parsed?.preamble?.radar_contact);
  const establishesContactByRadarContact =
    parsed?.intent === "FIRST_CONTACT_ACK" || Boolean(parsed?.preamble?.radar_contact);
  const hasPilotCalledOrJammed =
    Boolean(firstContact.awaiting_controller_response) ||
    typeof firstContact.contacted_at_ms === "number" ||
    typeof firstContact.last_jammed_at_ms === "number";

  return hasControllerAddressedFirstContact && (hasPilotCalledOrJammed || establishesContactByRadarContact);
}

export function aircraftWithOnFrequencyState(aircraft: AircraftState): AircraftState {
  const completedFirstContact = aircraft.pilot_first_contact
    ? {
        ...aircraft.pilot_first_contact,
        done: true,
        awaiting_controller_response: false,
        standby: false
      }
    : undefined;

  if (effectiveFrequencyState(aircraft) === "on_frequency" && !completedFirstContact) {
    return aircraft;
  }

  return {
    ...aircraft,
    ...(completedFirstContact ? { pilot_first_contact: completedFirstContact } : {}),
    frequency_state: "on_frequency"
  };
}

export function aircraftWithRadioStandbyState(
  aircraft: AircraftState,
  standbyAtMs?: number
): AircraftState {
  const completedFirstContact = aircraft.pilot_first_contact
    ? {
        ...aircraft.pilot_first_contact,
        done: true,
        awaiting_controller_response: false,
        standby: true,
        ...(typeof standbyAtMs === "number" ? { standby_at_ms: standbyAtMs } : {})
      }
    : undefined;

  return {
    ...aircraft,
    ...(completedFirstContact ? { pilot_first_contact: completedFirstContact } : {}),
    frequency_state: "on_frequency"
  };
}

export function frequencyStateLabel(aircraft: AircraftState) {
  if (aircraft.pilot_first_contact?.standby) {
    return "STANDBY";
  }

  switch (effectiveFrequencyState(aircraft)) {
    case "not_on_frequency":
      return "OFF FREQ";
    case "first_contacted":
      return "FIRST CONTACT";
    case "on_frequency":
      return "ON FREQ";
  }
}
