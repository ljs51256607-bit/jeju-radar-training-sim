import { aircraftDatablockOffset } from "./radarAircraftMenu";
import type { ScreenPoint } from "./radarMapLayout";

export interface RadarDatablockTarget {
  id: string;
  point: ScreenPoint;
}

export interface RadarDatablockBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ResolveAircraftDatablockOffsetsArgs {
  manualOffsets: Record<string, ScreenPoint>;
  targets: RadarDatablockTarget[];
  viewWidth: number;
}

const DATABLOCK_BOX = {
  height: 43,
  originX: -3,
  originY: -8,
  width: 112
};
const DATABLOCK_COLLISION_GAP_PX = 4;

function datablockOffsetCandidates(point: ScreenPoint, viewWidth: number): ScreenPoint[] {
  const preferred = aircraftDatablockOffset(point.x, point.y, viewWidth);
  const sideX = preferred.x < 0 ? -152 : 28;
  const otherSideX = preferred.x < 0 ? 28 : -152;
  const nearY = preferred.y;
  const alternateY = preferred.y < 0 ? 34 : -52;
  const lowerY = 78;
  const upperY = -96;
  const farLowerY = 122;
  const farUpperY = -140;
  const candidates = [
    preferred,
    { x: sideX, y: alternateY },
    { x: otherSideX, y: nearY },
    { x: otherSideX, y: alternateY },
    { x: sideX, y: lowerY },
    { x: sideX, y: upperY },
    { x: otherSideX, y: lowerY },
    { x: otherSideX, y: upperY },
    { x: sideX, y: farLowerY },
    { x: sideX, y: farUpperY },
    { x: otherSideX, y: farLowerY },
    { x: otherSideX, y: farUpperY }
  ];
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = `${candidate.x}:${candidate.y}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function aircraftDatablockBox(
  point: ScreenPoint,
  offset: ScreenPoint,
  gapPx = DATABLOCK_COLLISION_GAP_PX
): RadarDatablockBox {
  const left = point.x + offset.x + DATABLOCK_BOX.originX;
  const top = point.y + offset.y + DATABLOCK_BOX.originY;

  return {
    left: left - gapPx,
    right: left + DATABLOCK_BOX.width + gapPx,
    top: top - gapPx,
    bottom: top + DATABLOCK_BOX.height + gapPx
  };
}

export function datablockBoxesOverlap(first: RadarDatablockBox, second: RadarDatablockBox) {
  return !(
    first.right <= second.left ||
    second.right <= first.left ||
    first.bottom <= second.top ||
    second.bottom <= first.top
  );
}

function overlapArea(first: RadarDatablockBox, second: RadarDatablockBox) {
  if (!datablockBoxesOverlap(first, second)) {
    return 0;
  }

  const width = Math.min(first.right, second.right) - Math.max(first.left, second.left);
  const height = Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top);

  return Math.max(0, width) * Math.max(0, height);
}

function offsetPenalty(candidate: ScreenPoint, preferred: ScreenPoint) {
  return Math.abs(candidate.x - preferred.x) * 0.8 + Math.abs(candidate.y - preferred.y);
}

function candidateScore(candidateBox: RadarDatablockBox, placedBoxes: RadarDatablockBox[]) {
  return placedBoxes.reduce((score, placedBox) => {
    const area = overlapArea(candidateBox, placedBox);

    return score + (area > 0 ? 20_000 + area : 0);
  }, 0);
}

export function resolveAircraftDatablockOffsets({
  manualOffsets,
  targets,
  viewWidth
}: ResolveAircraftDatablockOffsetsArgs): Record<string, ScreenPoint> {
  const placedBoxes: RadarDatablockBox[] = [];
  const resolvedOffsets: Record<string, ScreenPoint> = {};

  for (const target of targets) {
    const manualOffset = manualOffsets[target.id];

    if (manualOffset) {
      resolvedOffsets[target.id] = manualOffset;
      placedBoxes.push(aircraftDatablockBox(target.point, manualOffset));
      continue;
    }

    const preferred = aircraftDatablockOffset(target.point.x, target.point.y, viewWidth);
    let bestOffset = preferred;
    let bestBox = aircraftDatablockBox(target.point, bestOffset);
    let bestScore = candidateScore(bestBox, placedBoxes);

    for (const candidate of datablockOffsetCandidates(target.point, viewWidth).slice(1)) {
      const box = aircraftDatablockBox(target.point, candidate);
      const score = candidateScore(box, placedBoxes) + offsetPenalty(candidate, preferred);

      if (score < bestScore) {
        bestOffset = candidate;
        bestBox = box;
        bestScore = score;
      }

      if (bestScore === 0) {
        break;
      }
    }

    resolvedOffsets[target.id] = bestOffset;
    placedBoxes.push(bestBox);
  }

  return resolvedOffsets;
}
