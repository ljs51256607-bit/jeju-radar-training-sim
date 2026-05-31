import { guidanceStatusLabel } from "./radarDatablock";
import type { AircraftCommandKind, AircraftState } from "./types";

export interface AircraftControlForm {
  heading: string;
  speed: string;
  altitude: string;
  verticalRate: string;
  scratchpad: string;
}

export type AircraftControlField = keyof AircraftControlForm;

const aircraftControlFields = new Set<AircraftControlField>([
  "heading",
  "speed",
  "altitude",
  "verticalRate",
  "scratchpad"
]);

export function aircraftControlFormFromState(
  aircraft: AircraftState,
  magneticVariationWestDeg: number
): AircraftControlForm {
  const headingTrueDeg = aircraft.assigned?.heading_true_deg ?? aircraft.heading_true_deg;

  return {
    heading: formatHeading(trueToMagneticHeading(headingTrueDeg, magneticVariationWestDeg)),
    speed: String(Math.round(aircraft.assigned?.speed_kt ?? aircraft.ground_speed_kt)),
    altitude: formatPanelAltitude(aircraft.assigned?.altitude_ft ?? aircraft.altitude_ft),
    verticalRate: String(Math.round(aircraft.vertical_rate_fpm)),
    scratchpad: aircraft.scratchpad ?? ""
  };
}

export function aircraftControlFormWithAssignedValues(
  currentForm: AircraftControlForm,
  aircraft: AircraftState,
  magneticVariationWestDeg: number,
  lockedField: AircraftControlField | null
): AircraftControlForm {
  const nextForm = { ...currentForm };

  if (
    lockedField !== "heading" &&
    typeof aircraft.assigned?.heading_true_deg === "number" &&
    Number.isFinite(aircraft.assigned.heading_true_deg)
  ) {
    nextForm.heading = formatHeading(
      trueToMagneticHeading(aircraft.assigned.heading_true_deg, magneticVariationWestDeg)
    );
  }

  if (
    lockedField !== "speed" &&
    typeof aircraft.assigned?.speed_kt === "number" &&
    Number.isFinite(aircraft.assigned.speed_kt)
  ) {
    nextForm.speed = String(Math.round(aircraft.assigned.speed_kt));
  }

  if (
    lockedField !== "altitude" &&
    typeof aircraft.assigned?.altitude_ft === "number" &&
    Number.isFinite(aircraft.assigned.altitude_ft)
  ) {
    nextForm.altitude = formatPanelAltitude(aircraft.assigned.altitude_ft);
  }

  if (
    lockedField !== "verticalRate" &&
    typeof aircraft.assigned?.vertical_rate_fpm === "number" &&
    Number.isFinite(aircraft.assigned.vertical_rate_fpm)
  ) {
    nextForm.verticalRate = String(Math.round(aircraft.assigned.vertical_rate_fpm));
  }

  if (lockedField !== "scratchpad") {
    nextForm.scratchpad = aircraft.scratchpad ?? "";
  }

  return nextForm;
}

export function aircraftControlFormsEqual(
  first: AircraftControlForm,
  second: AircraftControlForm
) {
  return (
    first.heading === second.heading &&
    first.speed === second.speed &&
    first.altitude === second.altitude &&
    first.verticalRate === second.verticalRate &&
    first.scratchpad === second.scratchpad
  );
}

export function formatGuidanceProfileStatus(aircraft: AircraftState) {
  const label = guidanceStatusLabel(aircraft);

  return label ? `PROF ${label}` : "PROF OK";
}

export function formatProcedureAuthorityLabel(aircraft: Pick<
  AircraftState,
  "procedure_kind" | "procedure_runtime_authority" | "procedure_reference_overlay_role"
>) {
  if (
    aircraft.procedure_kind !== "SID" ||
    aircraft.procedure_runtime_authority !== "training_runtime_route"
  ) {
    return null;
  }

  return aircraft.procedure_reference_overlay_role === "source_chart_linework_reference_overlay_only"
    ? "SID TRAINING / REF CAND"
    : "SID TRAINING";
}

export function formatPanelAltitude(altitudeFt: number) {
  const hundreds = String(Math.round(altitudeFt / 100)).padStart(3, "0");
  return altitudeFt < 14000 ? `A${hundreds}` : `F${hundreds}`;
}

export function formatCurrentAltitude(altitudeFt: number) {
  return `${formatPanelAltitude(altitudeFt)} / ${Math.round(altitudeFt)} ft`;
}

export function formatHeading(headingDeg: number) {
  return String(Math.round(normalizeHeading(headingDeg))).padStart(3, "0");
}

export function trueToMagneticHeading(
  headingTrueDeg: number,
  magneticVariationWestDeg: number
) {
  return normalizeHeading(headingTrueDeg + magneticVariationWestDeg);
}

export function magneticToTrueHeading(
  headingMagDeg: number,
  magneticVariationWestDeg: number
) {
  return normalizeHeading(headingMagDeg - magneticVariationWestDeg);
}

export function normalizeHeading(headingDeg: number) {
  return ((headingDeg % 360) + 360) % 360;
}

export function parseMagneticVariationWestDeg(magVar?: string) {
  if (!magVar) {
    return 0;
  }

  const match = magVar.match(/([\d.]+)\s*°?\s*([EW])/i);

  if (!match) {
    return 0;
  }

  const value = Number(match[1]);
  const direction = match[2].toUpperCase();

  if (!Number.isFinite(value)) {
    return 0;
  }

  return direction === "W" ? value : -value;
}

export function parseHeadingInput(value: string) {
  const normalizedValue = value.trim();

  if (!/^\d{2,3}$/.test(normalizedValue)) {
    return null;
  }

  const numeric =
    normalizedValue.length === 2
      ? Number(normalizedValue) * 10
      : Number(normalizedValue);

  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 360) {
    return null;
  }

  return normalizeHeading(Math.round(numeric));
}

export function parseSpeedInput(value: string) {
  const normalizedValue = value.trim();

  if (!/^\d{2,3}$/.test(normalizedValue)) {
    return null;
  }

  const numeric =
    normalizedValue.length === 2
      ? Number(normalizedValue) * 10
      : Number(normalizedValue);

  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 600) {
    return null;
  }

  return Math.round(numeric);
}

export function parseVerticalRateInput(value: string) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric < -6000 || numeric > 6000) {
    return null;
  }

  return Math.round(numeric);
}

export function parseAltitudeInput(value: string) {
  const normalizedValue = value.trim().toUpperCase();

  if (!normalizedValue) {
    return null;
  }

  if (normalizedValue.startsWith("A") || normalizedValue.startsWith("F")) {
    const hundreds = Number(normalizedValue.slice(1));

    if (!Number.isFinite(hundreds) || hundreds < 0 || hundreds > 600) {
      return null;
    }

    return Math.round(hundreds) * 100;
  }

  const numeric = Number(normalizedValue);

  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 60000) {
    return null;
  }

  return numeric < 1000 ? Math.round(numeric) * 100 : Math.round(numeric);
}

export function controlFieldFromEventTarget(target: EventTarget): AircraftControlField | null {
  if (target instanceof HTMLInputElement) {
    const field = target.name as AircraftControlField;

    return aircraftControlFields.has(field) ? field : null;
  }

  const namedTarget = target as { name?: unknown };
  const field = typeof namedTarget.name === "string" ? (namedTarget.name as AircraftControlField) : null;

  return field && aircraftControlFields.has(field) ? field : null;
}

export function controlFormOverrideFromEventTarget(
  target: EventTarget,
  field: AircraftControlField | null
): Partial<AircraftControlForm> {
  if (!field || !(target instanceof HTMLInputElement)) {
    return {};
  }

  return {
    [field]: target.value
  };
}

export function commandKindForControlField(
  field: AircraftControlField
): AircraftCommandKind | null {
  if (field === "heading") {
    return "HDG";
  }

  if (field === "speed") {
    return "SPD";
  }

  if (field === "altitude") {
    return "ALT";
  }

  if (field === "verticalRate") {
    return "VS";
  }

  return null;
}
