import type {
  AircraftQuickCommandField,
  AircraftState,
  ProcedureMenuAction
} from "./types";
import { holdingPatternForFix } from "./holdingPatterns";

export interface DatablockDragState {
  active: boolean;
  aircraftId: string | null;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
}

export const IDLE_DATABLOCK_DRAG_STATE: DatablockDragState = {
  active: false,
  aircraftId: null,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0
};

export interface AircraftTextMenuState {
  aircraftId: string;
  mode: "menu" | "entry" | "command";
  commandField?: AircraftQuickCommandField;
  commandLabel?: string;
  placeholder?: string;
  value: string;
  x: number;
  y: number;
}

export interface HeadingCommandFormatters {
  formatHeading: (headingDeg: number) => string;
  trueToMagneticHeading: (headingTrueDeg: number, magneticVariationWestDeg: number) => number;
}

export function aircraftDatablockOffset(x: number, y: number, viewWidth: number) {
  return {
    x: x > viewWidth - 250 ? -152 : 28,
    y: y < 140 ? 34 : -52
  };
}

export function formatDatablockAltitude(altitudeFt?: number) {
  if (typeof altitudeFt !== "number" || Number.isNaN(altitudeFt)) {
    return "---";
  }

  const hundreds = String(Math.round(altitudeFt / 100)).padStart(3, "0");
  return altitudeFt < 14000 ? `A${hundreds}` : `F${hundreds}`;
}

export function ownerPosition(target: AircraftState) {
  if (target.owner_position) {
    return target.owner_position;
  }

  return target.flight_phase === "departure" ? "DEP" : "APP";
}

export function datablockAirport(target: AircraftState) {
  if (target.flight_phase === "departure") {
    return target.destination_airport ?? "----";
  }

  return target.arrival_airport ?? "RKPC";
}

const departureProcedureMenuActions: ProcedureMenuAction[] = [
  "KAMIT",
  "AKPON",
  "TAMNA",
  "PANSI",
  "LIMDI"
];

export function aircraftProcedureMenuActions(target: AircraftState | null): ProcedureMenuAction[] {
  if (!target) {
    return [];
  }

  const targetOwnerPosition = ownerPosition(target);

  if (targetOwnerPosition === "APP" && (target.arrival_airport ?? "RKPC") === "RKPC") {
    return ["STAR_CXL", "STAR_DES", "ILS"];
  }

  if (targetOwnerPosition === "DEP") {
    return departureProcedureMenuActions;
  }

  return [];
}

export function procedureMenuActionLabel(action: ProcedureMenuAction) {
  if (action === "STAR_CXL") {
    return "STAR CXL";
  }

  if (action === "STAR_DES") {
    return "STAR VIA";
  }

  if (action === "ILS") {
    return "ILS";
  }

  return action.slice(0, 3);
}

export function publishedHoldMenuFixId(target: AircraftState | null) {
  if (!target?.next_fix) {
    return null;
  }

  return holdingPatternForFix(target.next_fix, target)?.fix_id ?? null;
}

export const quickCommandButtons: { field: AircraftQuickCommandField; label: string }[] = [
  { field: "heading", label: "HDG" },
  { field: "speed", label: "SPD" },
  { field: "altitude", label: "ALT" },
  { field: "verticalRate", label: "VS" }
];

export const quickAltitudePresetDatalistId = "radar-quick-altitude-preset-options";

export const quickAltitudePresetOptions = Array.from({ length: 32 }, (_, index) => {
  const altitudeFt = (index + 1) * 1000;
  return altitudeFt < 14000 ? String(altitudeFt) : formatDatablockAltitude(altitudeFt);
});

export function aircraftMenuCommandInitialValue(
  target: AircraftState,
  field: AircraftQuickCommandField,
  magneticVariationWestDeg: number,
  headingFormatters: HeadingCommandFormatters
) {
  if (field === "heading") {
    const headingTrue = target.assigned?.heading_true_deg ?? target.heading_true_deg;
    return headingFormatters.formatHeading(
      headingFormatters.trueToMagneticHeading(headingTrue, magneticVariationWestDeg)
    );
  }

  if (field === "speed") {
    return String(
      Math.round(
        target.assigned?.speed_kt ??
          target.controller_assigned_speed_kt ??
          target.indicated_speed_kt ??
          target.ground_speed_kt
      )
    );
  }

  if (field === "altitude") {
    return formatDatablockAltitude(target.assigned?.altitude_ft ?? target.altitude_ft);
  }

  return String(Math.round(target.assigned?.vertical_rate_fpm ?? target.vertical_rate_fpm ?? 0));
}
