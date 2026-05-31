import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from "react";
import { loadRadarDataset } from "../data/loadRadarDataset";
import type {
  AircraftState,
  RadarDataset
} from "../lib/types";

interface UseRadarDatasetLoaderOptions {
  setAircraftTraffic: Dispatch<SetStateAction<AircraftState[]>>;
  setDataset: Dispatch<SetStateAction<RadarDataset | null>>;
  setError: Dispatch<SetStateAction<string | null>>;
  setLastRadarUpdateAt: Dispatch<SetStateAction<number | null>>;
  simulationTimeRef: MutableRefObject<number>;
}

export function useRadarDatasetLoader({
  setAircraftTraffic,
  setDataset,
  setError,
  setLastRadarUpdateAt,
  simulationTimeRef
}: UseRadarDatasetLoaderOptions) {
  useEffect(() => {
    let cancelled = false;

    loadRadarDataset()
      .then((loadedDataset) => {
        if (!cancelled) {
          const nowMs = Date.now();
          simulationTimeRef.current = nowMs;
          setDataset(loadedDataset);
          setAircraftTraffic(loadedDataset.trafficSeed.aircraft);
          setLastRadarUpdateAt(nowMs);
        }
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    setAircraftTraffic,
    setDataset,
    setError,
    setLastRadarUpdateAt,
    simulationTimeRef
  ]);
}
