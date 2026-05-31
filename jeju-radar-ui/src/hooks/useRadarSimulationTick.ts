import {
  useEffect,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction
} from "react";
import {
  advanceAircraftForSimulationTick,
  LANDED_RETENTION_MS,
  RADAR_UPDATE_INTERVAL_MS,
  radarTickIntervalMs
} from "../lib/simulationTickRuntime";
import type {
  AircraftState,
  RadarDataset,
  WindSettings
} from "../lib/types";
import type { SimulationSpeed } from "../lib/scenarioStorage";

interface UseRadarSimulationTickOptions {
  dataset: RadarDataset | null;
  radarPaused: boolean;
  setAircraftTraffic: Dispatch<SetStateAction<AircraftState[]>>;
  setLastRadarUpdateAt: Dispatch<SetStateAction<number | null>>;
  simulationSpeed: SimulationSpeed;
  simulationTimeRef: MutableRefObject<number>;
  windSettings: WindSettings;
}

export function useRadarSimulationTick({
  dataset,
  radarPaused,
  setAircraftTraffic,
  setLastRadarUpdateAt,
  simulationSpeed,
  simulationTimeRef,
  windSettings
}: UseRadarSimulationTickOptions) {
  useEffect(() => {
    if (radarPaused || !dataset) {
      return;
    }

    const intervalId = window.setInterval(() => {
      simulationTimeRef.current += RADAR_UPDATE_INTERVAL_MS;
      const radarSweepTimeMs = simulationTimeRef.current;

      setAircraftTraffic((currentAircraft) =>
        currentAircraft
          .map((aircraft) =>
            advanceAircraftForSimulationTick(aircraft, dataset, radarSweepTimeMs, {
              wind: windSettings
            })
          )
          .filter(
            (aircraft) =>
              aircraft.landing_state !== "landed" ||
              typeof aircraft.landed_at_ms !== "number" ||
              radarSweepTimeMs - aircraft.landed_at_ms < LANDED_RETENTION_MS
          )
      );
      setLastRadarUpdateAt(radarSweepTimeMs);
    }, radarTickIntervalMs(simulationSpeed));

    return () => window.clearInterval(intervalId);
  }, [
    dataset,
    radarPaused,
    setAircraftTraffic,
    setLastRadarUpdateAt,
    simulationSpeed,
    simulationTimeRef,
    windSettings
  ]);
}
