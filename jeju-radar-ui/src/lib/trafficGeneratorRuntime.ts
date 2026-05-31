import { distanceNmBetweenPoints } from "./aircraftMotion";
import {
  aircraftIsPreEntryForArrivalStream,
  createArrivalStreamAircraft,
  createDepartureWaveAircraft
} from "./aircraftFactory";
import { resolveDirectFix } from "./procedureGuidance";
import type { ArrivalStream, DepartureWave } from "./scenarioStorage";
import type { AircraftState, RadarDataset } from "./types";
import type { MissedApproachEvent } from "./missedApproachRuntime";

export const MISSED_APPROACH_DEPARTURE_RELEASE_MIN_DELAY_MS = 30_000;
export const MISSED_APPROACH_DEPARTURE_RELEASE_MAX_DELAY_MS = 60_000;

export function departureWavesDueForSpawn(waves: DepartureWave[], nowMs: number) {
  return waves.filter(
    (wave) => wave.spawnedCount < wave.totalCount && nowMs - wave.lastSpawnAtMs >= wave.intervalMs
  );
}

export function missedApproachDepartureReleaseDelayMs(randomValue = Math.random()) {
  const ratio = Math.min(1, Math.max(0, randomValue));

  return Math.round(
    MISSED_APPROACH_DEPARTURE_RELEASE_MIN_DELAY_MS +
      ratio *
        (MISSED_APPROACH_DEPARTURE_RELEASE_MAX_DELAY_MS -
          MISSED_APPROACH_DEPARTURE_RELEASE_MIN_DELAY_MS)
  );
}

export function retimeDepartureWavesAfterMissedApproach(
  currentWaves: DepartureWave[],
  event: MissedApproachEvent,
  nowMs: number,
  delayMs = missedApproachDepartureReleaseDelayMs()
) {
  const candidateWaves = currentWaves.filter(
    (wave) => wave.spawnedCount < wave.totalCount && wave.departureRunway === event.profile.runway
  );
  const runwayModeFallbackWaves =
    candidateWaves.length > 0
      ? []
      : currentWaves.filter(
          (wave) => wave.spawnedCount < wave.totalCount && wave.runway === event.profile.runway
        );
  const targetWaveIds = new Set([...candidateWaves, ...runwayModeFallbackWaves].map((wave) => wave.id));

  if (targetWaveIds.size === 0) {
    return {
      waves: currentWaves,
      retimed_count: 0,
      delay_ms: delayMs
    };
  }

  return {
    waves: currentWaves.map((wave) =>
      targetWaveIds.has(wave.id)
        ? {
            ...wave,
            lastSpawnAtMs: nowMs + delayMs - wave.intervalMs
          }
        : wave
    ),
    retimed_count: targetWaveIds.size,
    delay_ms: delayMs
  };
}

export function spawnDepartureWaveAircraft(
  dataset: RadarDataset,
  dueWaves: DepartureWave[],
  currentAircraft: AircraftState[],
  nowMs: number
) {
  if (dueWaves.length === 0) {
    return currentAircraft;
  }

  const nextAircraft = [...currentAircraft];

  for (const wave of dueWaves) {
    const createdAircraft = createDepartureWaveAircraft(
      dataset,
      wave,
      nextAircraft,
      wave.spawnedCount + 1,
      nowMs
    );

    if (createdAircraft) {
      nextAircraft.push(createdAircraft);
    }
  }

  return nextAircraft;
}

export function advanceDepartureWavesAfterSpawn(
  currentWaves: DepartureWave[],
  dueWaves: DepartureWave[],
  nowMs: number
) {
  if (dueWaves.length === 0) {
    return currentWaves;
  }

  return currentWaves
    .map((wave) => {
      if (!dueWaves.some((dueWave) => dueWave.id === wave.id)) {
        return wave;
      }

      return {
        ...wave,
        spawnedCount: wave.spawnedCount + 1,
        lastSpawnAtMs: nowMs
      };
    })
    .filter((wave) => wave.spawnedCount < wave.totalCount);
}

export function fillArrivalStreamAircraft(
  dataset: RadarDataset,
  streams: ArrivalStream[],
  currentAircraft: AircraftState[],
  nowMs: number
) {
  const nextAircraft = [...currentAircraft];

  for (const stream of streams) {
    const entryFix = resolveDirectFix(dataset, stream.entryFix);

    if (!entryFix) {
      continue;
    }

    const preEntryAircraft = nextAircraft
      .filter(
        (aircraft) =>
          aircraft.scenario_stream_id === stream.id &&
          aircraft.scenario_stream_role === "arrival_stream" &&
          aircraftIsPreEntryForArrivalStream(aircraft, stream.entryFix) &&
          distanceNmBetweenPoints(
            aircraft.latitude,
            aircraft.longitude,
            entryFix.latitude,
            entryFix.longitude
          ) > Math.max(0.5, stream.spacingNm * 0.45)
      )
      .map((aircraft) =>
        distanceNmBetweenPoints(
          aircraft.latitude,
          aircraft.longitude,
          entryFix.latitude,
          entryFix.longitude
        )
      );
    const missingCount = stream.targetBufferCount - preEntryAircraft.length;

    if (missingCount <= 0) {
      continue;
    }

    let farthestDistanceNm = Math.max(0, ...preEntryAircraft);

    for (let index = 0; index < missingCount; index += 1) {
      farthestDistanceNm += stream.spacingNm;

      const createdAircraft = createArrivalStreamAircraft(
        dataset,
        stream,
        farthestDistanceNm,
        nextAircraft,
        nextAircraft.length + index + 1,
        nowMs
      );

      if (createdAircraft) {
        nextAircraft.push(createdAircraft);
      }
    }
  }

  return nextAircraft;
}
