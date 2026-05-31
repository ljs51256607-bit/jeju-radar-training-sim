import type { Dispatch, SetStateAction } from "react";
import {
  arrivalStarGuidanceForFix
} from "../lib/aircraftFactory";
import {
  resolveDirectFix
} from "../lib/procedureGuidance";
import {
  procedureVisibleForRunwayMode
} from "../lib/procedureRouteUtils";
import {
  normalizeFixId
} from "../lib/scenarioTraffic";
import type {
  MapLabel,
  RadarDataset,
  RunwayMode
} from "../lib/types";

interface UseFixSpawnPickControllerOptions {
  closeScenarioStoragePanel: () => void;
  closeWindPanel: () => void;
  dataset: RadarDataset | null;
  handlePickedFixSpawn: (fixId: string, errorMessage: string | null) => void;
  selectedRunway: RunwayMode;
  setControlPanelOpen: Dispatch<SetStateAction<boolean>>;
}

export function useFixSpawnPickController({
  closeScenarioStoragePanel,
  closeWindPanel,
  dataset,
  handlePickedFixSpawn,
  selectedRunway,
  setControlPanelOpen
}: UseFixSpawnPickControllerOptions) {
  function handlePickFixSpawn(fix: MapLabel) {
    if (!dataset) {
      return;
    }

    const fixId = normalizeFixId(fix.text);
    const resolvedFix = resolveDirectFix(dataset, fixId);
    const visibleStars = dataset.procedures.stars.filter((procedure) =>
      procedureVisibleForRunwayMode(procedure, selectedRunway)
    );
    const starGuidance =
      resolvedFix !== null
        ? arrivalStarGuidanceForFix(
            dataset,
            visibleStars,
            fixId,
            resolvedFix.latitude,
            resolvedFix.longitude
          )
        : null;

    handlePickedFixSpawn(
      fixId,
      starGuidance || resolvedFix === null
        ? null
        : `${fixId}는 RWY ${selectedRunway} STAR 경로에 없음`
    );
    closeWindPanel();
    setControlPanelOpen(false);
    closeScenarioStoragePanel();
  }

  return {
    handlePickFixSpawn
  };
}
