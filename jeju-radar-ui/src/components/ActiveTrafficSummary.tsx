import type { ArrivalStream, DepartureWave } from "../lib/scenarioStorage";

interface ActiveTrafficSummaryProps {
  activeArrivalStreams: ArrivalStream[];
  activeDepartureWaves: DepartureWave[];
}

export default function ActiveTrafficSummary({
  activeArrivalStreams,
  activeDepartureWaves
}: ActiveTrafficSummaryProps) {
  return (
    <>
      {activeArrivalStreams.length > 0 ? (
        <div className="scenario-stream-active">
          {activeArrivalStreams.map((stream) => (
            <span key={stream.id}>
              ARR {stream.entryFix} {stream.spacingNm}NM keep {stream.targetBufferCount}
            </span>
          ))}
        </div>
      ) : null}

      {activeDepartureWaves.length > 0 ? (
        <div className="scenario-stream-active">
          {activeDepartureWaves.map((wave) => (
            <span key={wave.id}>
              RWY{wave.departureRunway} {wave.exitFix} {wave.spawnedCount}/{wave.totalCount} every{" "}
              {Math.round(wave.intervalMs / 600) / 100}m
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}
