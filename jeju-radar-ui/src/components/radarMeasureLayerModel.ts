import {
  cumulativeMeasureDistanceNm as measureCumulativeDistanceNm,
  measureDistanceLabel,
  measureEtaLabel,
  measureLineBearingTrueDeg,
  measureLineEndCoordinate,
  measureLineStartCoordinate,
  type MeasureLineState
} from "../lib/measureTool";
import type { ScreenPoint } from "../lib/radarMapLayout";
import type { AircraftState } from "../lib/types";

export interface RadarMeasureLayerBaseProps {
  aircraft: AircraftState[];
  formatHeading: (headingDeg: number) => string;
  labelScale: number;
  magneticVariationWestDeg: number;
  project: (coordinate: [number, number]) => ScreenPoint;
  renderedMeasureLines: MeasureLineState[];
  trueToMagneticHeading: (headingTrueDeg: number, magneticVariationWestDeg: number) => number;
}

export function measureLinePoints(
  measureLine: MeasureLineState,
  aircraft: AircraftState[],
  project: (coordinate: [number, number]) => ScreenPoint
) {
  const measureStart = measureLineStartCoordinate(measureLine, aircraft);
  const measureEnd = measureLineEndCoordinate(measureLine, aircraft);
  const startPoint = project(measureStart);
  const endPoint = project(measureEnd);

  return {
    endPoint,
    midPoint: {
      x: (startPoint.x + endPoint.x) / 2,
      y: (startPoint.y + endPoint.y) / 2
    },
    startPoint
  };
}

export function measureLineLabel(
  props: RadarMeasureLayerBaseProps,
  measureLine: MeasureLineState,
  measureLineIndex: number
) {
  const distanceNm = measureCumulativeDistanceNm(
    props.renderedMeasureLines,
    measureLineIndex,
    props.aircraft
  );
  const bearingTrueDeg = measureLineBearingTrueDeg(measureLine, props.aircraft);
  const bearingMagDeg = props.trueToMagneticHeading(
    bearingTrueDeg,
    props.magneticVariationWestDeg
  );

  return `${measureDistanceLabel(distanceNm)}NM ${props.formatHeading(
    bearingMagDeg
  )} ${measureEtaLabel(distanceNm, measureLine.groundSpeedKt)}MIN`;
}
