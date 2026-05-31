import type { AircraftState, PilotFirstContactRole } from "./types";

export type RadioQueueStatus = "JAM" | "CALL" | "SBY";
export type RadioQueueAction = "SAY_AGAIN" | "GO_AHEAD" | "STANDBY";

export interface RadioQueueRow {
  aircraftId: string;
  callsign: string;
  status: RadioQueueStatus;
  role: PilotFirstContactRole;
  detail: string;
  sequenceMs: number;
}

const statusPriority: Record<RadioQueueStatus, number> = {
  CALL: 0,
  JAM: 1,
  SBY: 2
};

export function radioQueueRows(aircraftTraffic: AircraftState[]): RadioQueueRow[] {
  return aircraftTraffic
    .map((aircraft, trafficIndex) => {
      const row = radioQueueRowForAircraft(aircraft);

      return row ? { row, trafficIndex } : null;
    })
    .filter((entry): entry is { row: RadioQueueRow; trafficIndex: number } => Boolean(entry))
    .sort((first, second) =>
      statusPriority[first.row.status] - statusPriority[second.row.status] ||
      radioQueueSortTime(first.row) - radioQueueSortTime(second.row) ||
      first.trafficIndex - second.trafficIndex
    )
    .map((entry) => entry.row);
}

export function radioQueueCompactText(rows: RadioQueueRow[]) {
  return rows.map((row) => `${row.status} ${row.callsign} ${row.detail}`).join(" / ");
}

export function radioQueueActionsForRow(row: RadioQueueRow): RadioQueueAction[] {
  if (row.status === "SBY") {
    return ["GO_AHEAD"];
  }

  if (row.status === "CALL") {
    return ["GO_AHEAD", "STANDBY"];
  }

  return ["SAY_AGAIN", "GO_AHEAD", "STANDBY"];
}

export function radioQueueActionLabel(action: RadioQueueAction) {
  switch (action) {
    case "SAY_AGAIN":
      return "SAY";
    case "GO_AHEAD":
      return "GO";
    case "STANDBY":
      return "SBY";
  }
}

export function radioQueueActionCommandText(callsign: string, action: RadioQueueAction) {
  const normalized = normalizedCallsign(callsign);

  switch (action) {
    case "SAY_AGAIN":
      return `${normalized} say again`;
    case "GO_AHEAD":
      return `${normalized} go ahead`;
    case "STANDBY":
      return `${normalized} standby`;
  }
}

export function radioQueueSelectedActionCommandText(
  rows: RadioQueueRow[],
  aircraftId: string | null,
  action: RadioQueueAction
) {
  if (!aircraftId) {
    return null;
  }

  const row = rows.find((candidate) => candidate.aircraftId === aircraftId);
  if (!row || !radioQueueActionsForRow(row).includes(action)) {
    return null;
  }

  return radioQueueActionCommandText(row.callsign, action);
}

function radioQueueRowForAircraft(aircraft: AircraftState): RadioQueueRow | null {
  const profile = aircraft.pilot_first_contact;

  if (!profile) {
    return null;
  }

  if (profile.standby) {
    return {
      aircraftId: aircraft.id,
      callsign: normalizedCallsign(aircraft.callsign),
      status: "SBY",
      role: profile.role,
      detail: firstContactDetail(profile.role, profile.trigger_fix, profile.trigger_altitude_ft),
      sequenceMs: profile.standby_at_ms ?? Number.MAX_SAFE_INTEGER
    };
  }

  if (!profile.done && typeof profile.last_jammed_at_ms === "number") {
    return {
      aircraftId: aircraft.id,
      callsign: normalizedCallsign(aircraft.callsign),
      status: "JAM",
      role: profile.role,
      detail: firstContactDetail(profile.role, profile.trigger_fix, profile.trigger_altitude_ft),
      sequenceMs: profile.last_jammed_at_ms
    };
  }

  if (!profile.done && profile.awaiting_controller_response) {
    return {
      aircraftId: aircraft.id,
      callsign: normalizedCallsign(aircraft.callsign),
      status: "CALL",
      role: profile.role,
      detail: firstContactDetail(profile.role, profile.trigger_fix, profile.trigger_altitude_ft),
      sequenceMs: profile.contacted_at_ms ?? Number.MAX_SAFE_INTEGER
    };
  }

  return null;
}

function radioQueueSortTime(row: RadioQueueRow) {
  return row.status === "JAM" ? -row.sequenceMs : row.sequenceMs;
}

function firstContactDetail(
  role: PilotFirstContactRole,
  triggerFix: string | undefined,
  triggerAltitudeFt: number | undefined
) {
  if (triggerFix) {
    return `${role} ${triggerFix.toUpperCase()}`;
  }

  if (typeof triggerAltitudeFt === "number") {
    return `${role} ${Math.round(triggerAltitudeFt)}FT`;
  }

  return role;
}

function normalizedCallsign(callsign: string) {
  return callsign.trim().toUpperCase();
}
