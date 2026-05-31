import { distanceNmBetweenPoints } from "./aircraftMotion";
import type { Projector, ScreenPoint } from "./radar";
import {
  svgPointToMapPoint,
  type SvgViewportSize
} from "./radarMapLayout";

const SCALE_BAR_CANDIDATES_NM = [1, 2, 5, 10, 20, 30, 40, 50, 80, 100, 150, 200, 300] as const;
const SCALE_BAR_TARGET_WIDTH_PX = 118;

export interface RadarScaleReadout {
  horizontalRangeNm: number;
  verticalRangeNm: number;
  scaleBarNm: number;
  scaleBarWidthPx: number;
  rangeLabel: string;
  verticalRangeLabel: string;
  scaleBarLabel: string;
}

export interface BuildRadarScaleReadoutOptions {
  pan: ScreenPoint;
  projector: Pick<Projector, "projectRadiusNm" | "unproject">;
  radarSite: [number, number] | null;
  svgSize: SvgViewportSize;
  viewHeight: number;
  viewWidth: number;
  zoomScale: number;
}

export function buildRadarScaleReadout({
  pan,
  projector,
  radarSite,
  svgSize,
  viewHeight,
  viewWidth,
  zoomScale
}: BuildRadarScaleReadoutOptions): RadarScaleReadout {
  const transformState = {
    pan,
    viewHeight,
    viewWidth,
    zoomScale
  };
  const centerSvgPoint = { x: viewWidth / 2, y: viewHeight / 2 };
  const leftCoordinate = visibleCoordinateForSvgPoint(projector, { x: 0, y: centerSvgPoint.y }, transformState);
  const rightCoordinate = visibleCoordinateForSvgPoint(projector, { x: viewWidth, y: centerSvgPoint.y }, transformState);
  const topCoordinate = visibleCoordinateForSvgPoint(projector, { x: centerSvgPoint.x, y: 0 }, transformState);
  const bottomCoordinate = visibleCoordinateForSvgPoint(projector, { x: centerSvgPoint.x, y: viewHeight }, transformState);
  const centerCoordinate = visibleCoordinateForSvgPoint(projector, centerSvgPoint, transformState);
  const horizontalRangeNm = distanceNmBetweenCoordinates(leftCoordinate, rightCoordinate);
  const verticalRangeNm = distanceNmBetweenCoordinates(topCoordinate, bottomCoordinate);
  const viewScale = renderedViewScale(svgSize, viewWidth, viewHeight);
  const scaleSampleCenter = radarSite ?? centerCoordinate;
  const widthForNm = (distanceNm: number) =>
    Math.max(0, projector.projectRadiusNm(scaleSampleCenter, distanceNm) * zoomScale * viewScale);
  const scaleBarNm = selectScaleBarNm(SCALE_BAR_CANDIDATES_NM, widthForNm);
  const scaleBarWidthPx = Number(widthForNm(scaleBarNm).toFixed(1));

  return {
    horizontalRangeNm,
    verticalRangeNm,
    scaleBarNm,
    scaleBarWidthPx,
    rangeLabel: `RNG ${formatRadarRangeNm(horizontalRangeNm)}NM`,
    verticalRangeLabel: `V ${formatRadarRangeNm(verticalRangeNm)}NM`,
    scaleBarLabel: `${formatScaleBarNm(scaleBarNm)}NM`
  };
}

export function selectScaleBarNm(
  candidatesNm: readonly number[],
  widthForNm: (distanceNm: number) => number,
  targetWidthPx = SCALE_BAR_TARGET_WIDTH_PX
) {
  const candidates = candidatesNm
    .filter((distanceNm) => Number.isFinite(distanceNm) && distanceNm > 0)
    .sort((first, second) => first - second);

  if (candidates.length === 0) {
    return 1;
  }

  let selected = candidates[0];

  for (const candidate of candidates) {
    const widthPx = widthForNm(candidate);

    if (!Number.isFinite(widthPx) || widthPx <= 0) {
      continue;
    }

    if (widthPx <= targetWidthPx) {
      selected = candidate;
      continue;
    }

    break;
  }

  return selected;
}

export function formatRadarRangeNm(distanceNm: number) {
  if (!Number.isFinite(distanceNm) || distanceNm < 0) {
    return "--";
  }

  if (distanceNm >= 100) {
    return String(Math.round(distanceNm / 5) * 5);
  }

  if (distanceNm >= 10) {
    return String(Math.round(distanceNm));
  }

  return distanceNm.toFixed(1);
}

function formatScaleBarNm(distanceNm: number) {
  return Number.isInteger(distanceNm) ? String(distanceNm) : formatRadarRangeNm(distanceNm);
}

function visibleCoordinateForSvgPoint(
  projector: Pick<Projector, "unproject">,
  point: ScreenPoint,
  transformState: Parameters<typeof svgPointToMapPoint>[1]
) {
  return projector.unproject(svgPointToMapPoint(point, transformState));
}

function distanceNmBetweenCoordinates(first: [number, number], second: [number, number]) {
  return distanceNmBetweenPoints(first[1], first[0], second[1], second[0]);
}

function renderedViewScale(svgSize: SvgViewportSize, viewWidth: number, viewHeight: number) {
  if (svgSize.width <= 0 || svgSize.height <= 0 || viewWidth <= 0 || viewHeight <= 0) {
    return 1;
  }

  return Math.min(svgSize.width / viewWidth, svgSize.height / viewHeight);
}
