import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import { isDirectableFixLabel } from "../lib/radarMapLayout";
import type { MapLabel } from "../lib/types";

type FixInteractionEvent =
  | ReactMouseEvent<SVGElement>
  | ReactPointerEvent<SVGElement>;

interface UseRadarFixPickInteractionsOptions {
  clearMeasureLines: () => void;
  fixSpawnPickActive: boolean;
  onDirectToFix: (fix: MapLabel) => void;
  onPickFixSpawn: (fix: MapLabel) => void;
  selectedAircraftId: string | null;
}

export function useRadarFixPickInteractions({
  clearMeasureLines,
  fixSpawnPickActive,
  onDirectToFix,
  onPickFixSpawn,
  selectedAircraftId
}: UseRadarFixPickInteractionsOptions) {
  function applyDirectToFix(label: MapLabel) {
    clearMeasureLines();
    onDirectToFix(label);
  }

  function applyFixSpawnPick(label: MapLabel) {
    clearMeasureLines();
    onPickFixSpawn(label);
  }

  function handleDirectFixInteraction(event: FixInteractionEvent, label: MapLabel) {
    if (fixSpawnPickActive && isDirectableFixLabel(label)) {
      event.preventDefault();
      event.stopPropagation();
      applyFixSpawnPick(label);
      return;
    }

    if (!selectedAircraftId || !isDirectableFixLabel(label)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    applyDirectToFix(label);
  }

  return {
    handleDirectFixClick: handleDirectFixInteraction,
    handleDirectFixMouseDown: handleDirectFixInteraction,
    handleDirectFixPointerDown: handleDirectFixInteraction
  };
}
