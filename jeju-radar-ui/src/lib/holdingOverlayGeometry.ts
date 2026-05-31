import {
  holdingOutboundHeading,
  resolveHoldingFix
} from "./holdingPatterns";
import type { HoldingPattern, RadarDataset } from "./types";
import type { ScreenPoint } from "./radarMapLayout";

export interface HoldingOverlayGeometry {
  id: string;
  kind: HoldingPattern["kind"];
  label: string;
  labelPoint: ScreenPoint;
  pathD: string;
  fixCoordinate: [number, number];
  outboundCoordinate: [number, number];
  fixOffsetCoordinate: [number, number];
  outboundOffsetCoordinate: [number, number];
  outboundHeadingTrueDeg: number;
  sideHeadingTrueDeg: number;
  legDistanceNm: number;
  widthNm: number;
}

export function normalizeHeadingDeg(headingDeg: number) {
  return ((headingDeg % 360) + 360) % 360;
}

export function coordinateAtBearingDistanceNm(
  origin: { latitude: number; longitude: number },
  bearingTrueDeg: number,
  distanceNm: number
): [number, number] {
  const bearingRad = (bearingTrueDeg * Math.PI) / 180;
  const northNm = Math.cos(bearingRad) * distanceNm;
  const eastNm = Math.sin(bearingRad) * distanceNm;
  const longitudeScale = Math.cos((origin.latitude * Math.PI) / 180);

  return [
    origin.longitude + eastNm / (60 * longitudeScale),
    origin.latitude + northNm / 60
  ];
}

export function holdingPatternLegDistanceNm(pattern: HoldingPattern) {
  const referenceSpeedKt = pattern.max_speed_kt ?? 230;

  return Math.max(2.4, Math.min(6.2, (referenceSpeedKt * pattern.leg_time_min) / 60));
}

export function holdingPatternOverlayPath(
  pattern: HoldingPattern,
  dataset: RadarDataset,
  project: (coordinate: [number, number]) => ScreenPoint
): HoldingOverlayGeometry | null {
  const fix = resolveHoldingFix(dataset, pattern.fix_id);

  if (!fix) {
    return null;
  }

  const outboundHeadingTrueDeg = holdingOutboundHeading(pattern);
  const sideHeadingTrueDeg = normalizeHeadingDeg(
    outboundHeadingTrueDeg + (pattern.turn_direction === "right" ? 90 : -90)
  );
  const legDistanceNm = holdingPatternLegDistanceNm(pattern);
  const widthNm = Math.max(1.0, Math.min(1.8, legDistanceNm * 0.32));
  const fixCoordinate: [number, number] = [fix.longitude, fix.latitude];
  const outboundCoordinate = coordinateAtBearingDistanceNm(
    fix,
    outboundHeadingTrueDeg,
    legDistanceNm
  );
  const sideOrigin = { latitude: fix.latitude, longitude: fix.longitude };
  const fixOffsetCoordinate = coordinateAtBearingDistanceNm(sideOrigin, sideHeadingTrueDeg, widthNm);
  const outboundOffsetCoordinate = coordinateAtBearingDistanceNm(
    { latitude: outboundCoordinate[1], longitude: outboundCoordinate[0] },
    sideHeadingTrueDeg,
    widthNm
  );
  const fixPoint = project(fixCoordinate);
  const outboundPoint = project(outboundCoordinate);
  const fixOffsetPoint = project(fixOffsetCoordinate);
  const outboundOffsetPoint = project(outboundOffsetCoordinate);
  const outboundControl = {
    x: (outboundPoint.x + outboundOffsetPoint.x) / 2,
    y: (outboundPoint.y + outboundOffsetPoint.y) / 2
  };
  const fixControl = {
    x: (fixPoint.x + fixOffsetPoint.x) / 2,
    y: (fixPoint.y + fixOffsetPoint.y) / 2
  };

  return {
    id: pattern.id,
    kind: pattern.kind,
    label: `${pattern.fix_id} HLD`,
    labelPoint: fixOffsetPoint,
    pathD: [
      `M ${fixPoint.x.toFixed(1)} ${fixPoint.y.toFixed(1)}`,
      `L ${outboundPoint.x.toFixed(1)} ${outboundPoint.y.toFixed(1)}`,
      `Q ${outboundControl.x.toFixed(1)} ${outboundControl.y.toFixed(1)} ${outboundOffsetPoint.x.toFixed(1)} ${outboundOffsetPoint.y.toFixed(1)}`,
      `L ${fixOffsetPoint.x.toFixed(1)} ${fixOffsetPoint.y.toFixed(1)}`,
      `Q ${fixControl.x.toFixed(1)} ${fixControl.y.toFixed(1)} ${fixPoint.x.toFixed(1)} ${fixPoint.y.toFixed(1)}`
    ].join(" "),
    fixCoordinate,
    outboundCoordinate,
    fixOffsetCoordinate,
    outboundOffsetCoordinate,
    outboundHeadingTrueDeg,
    sideHeadingTrueDeg,
    legDistanceNm,
    widthNm
  };
}
