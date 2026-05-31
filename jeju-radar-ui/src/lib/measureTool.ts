import {
  distanceNmBetweenPoints,
  initialBearingTrueDeg
} from "./aircraftMotion";
import type { AircraftState } from "./types";

export const MAX_MEASURE_CHAIN_LEGS = 5;

export type MeasureStartMode = "aircraft" | "point";
export type MeasureEndMode = "aircraft" | "point";

export interface MeasureLineState {
  id: string;
  aircraftId: string;
  start: [number, number];
  startMode: MeasureStartMode;
  end: [number, number];
  endMode: MeasureEndMode;
  endAircraftId?: string;
  groundSpeedKt: number;
  fixed: boolean;
  chainIndex: number;
}

export interface MeasureDragState {
  active: boolean;
  aircraftId: string | null;
  pointerId: number | null;
  start: [number, number] | null;
  startMode: MeasureStartMode;
  end: [number, number] | null;
  endMode: MeasureEndMode;
  endAircraftId: string | null;
  groundSpeedKt: number;
  chainIndex: number;
}

export const IDLE_MEASURE_DRAG_STATE: MeasureDragState = {
  active: false,
  aircraftId: null,
  pointerId: null,
  start: null,
  startMode: "point",
  end: null,
  endMode: "point",
  endAircraftId: null,
  groundSpeedKt: 0,
  chainIndex: 0
};

export function renderedMeasureLines(
  measureLines: MeasureLineState[],
  measureDragState: MeasureDragState
): MeasureLineState[] {
  return [
    ...measureLines,
    ...(measureDragState.active &&
    measureDragState.aircraftId &&
    measureDragState.start &&
    measureDragState.end
      ? [
          {
            id: "active-measure-line",
            aircraftId: measureDragState.aircraftId,
            start: measureDragState.start,
            startMode: measureDragState.startMode,
            end: measureDragState.end,
            endMode: measureDragState.endMode,
            endAircraftId: measureDragState.endAircraftId ?? undefined,
            groundSpeedKt: measureDragState.groundSpeedKt,
            fixed: false,
            chainIndex: measureDragState.chainIndex
          }
        ]
      : [])
  ];
}

export function measureLineStartCoordinate(
  measureLine: MeasureLineState,
  aircraft: AircraftState[]
): [number, number] {
  const currentAircraftPosition = aircraft.find((target) => target.id === measureLine.aircraftId);

  if (measureLine.startMode === "aircraft" && currentAircraftPosition) {
    return [currentAircraftPosition.longitude, currentAircraftPosition.latitude];
  }

  return measureLine.start;
}

export function measureLineEndCoordinate(
  measureLine: MeasureLineState,
  aircraft: AircraftState[]
): [number, number] {
  const endAircraftPosition = measureLine.endAircraftId
    ? aircraft.find((target) => target.id === measureLine.endAircraftId)
    : null;

  if (measureLine.endMode === "aircraft" && endAircraftPosition) {
    return [endAircraftPosition.longitude, endAircraftPosition.latitude];
  }

  return measureLine.end;
}

export function measureLineDistanceNm(measureLine: MeasureLineState, aircraft: AircraftState[]) {
  const start = measureLineStartCoordinate(measureLine, aircraft);
  const end = measureLineEndCoordinate(measureLine, aircraft);

  return distanceNmBetweenPoints(start[1], start[0], end[1], end[0]);
}

export function cumulativeMeasureDistanceNm(
  measureLines: MeasureLineState[],
  measureLineIndex: number,
  aircraft: AircraftState[]
) {
  return measureLines.reduce((totalDistanceNm, measureLine, currentIndex) => {
    if (currentIndex > measureLineIndex) {
      return totalDistanceNm;
    }

    return totalDistanceNm + measureLineDistanceNm(measureLine, aircraft);
  }, 0);
}

export function measureLineBearingTrueDeg(measureLine: MeasureLineState, aircraft: AircraftState[]) {
  const measureStart = measureLineStartCoordinate(measureLine, aircraft);
  const measureEnd = measureLineEndCoordinate(measureLine, aircraft);

  return initialBearingTrueDeg(
    measureStart[1],
    measureStart[0],
    measureEnd[1],
    measureEnd[0]
  );
}

export function measureDistanceLabel(distanceNm: number) {
  return distanceNm >= 10 ? distanceNm.toFixed(0) : distanceNm.toFixed(1);
}

export function measureEtaLabel(distanceNm: number, groundSpeedKt: number) {
  if (!Number.isFinite(groundSpeedKt) || groundSpeedKt <= 0) {
    return "--.-";
  }

  return ((distanceNm / groundSpeedKt) * 60).toFixed(1);
}

export function estimateMeasureLabelWidth(label: string) {
  return Math.max(62, label.length * 5.9 + 8);
}

export function measureLabelContainsMapPoint(
  mapPoint: { x: number; y: number },
  midPoint: { x: number; y: number },
  labelWidth: number,
  labelScale: number
) {
  const localX = (mapPoint.x - midPoint.x) / labelScale;
  const localY = (mapPoint.y - midPoint.y) / labelScale;

  return (
    localX >= -labelWidth / 2 - 8 &&
    localX <= labelWidth / 2 + 8 &&
    localY >= -16 &&
    localY <= 9
  );
}

export function measureLineFromDrag(activeDrag: MeasureDragState, id: string): MeasureLineState | null {
  if (!activeDrag.aircraftId || !activeDrag.start || !activeDrag.end) {
    return null;
  }

  return {
    id,
    aircraftId: activeDrag.aircraftId,
    start: activeDrag.start,
    startMode: activeDrag.startMode,
    end: activeDrag.end,
    endMode: activeDrag.endMode,
    endAircraftId: activeDrag.endAircraftId ?? undefined,
    groundSpeedKt: activeDrag.groundSpeedKt,
    fixed: true,
    chainIndex: activeDrag.chainIndex
  };
}
