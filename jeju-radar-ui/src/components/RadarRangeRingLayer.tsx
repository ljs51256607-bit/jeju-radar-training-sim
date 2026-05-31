import type { Projector } from "../lib/radar";

interface RadarRangeRingLayerProps {
  labelScale: number;
  projector: Projector;
  radarSite: [number, number] | null;
  rangeRings: number[];
  showRings: boolean;
}

export default function RadarRangeRingLayer({
  labelScale,
  projector,
  radarSite,
  rangeRings,
  showRings
}: RadarRangeRingLayerProps) {
  if (!showRings || !radarSite) {
    return null;
  }

  const center = projector.project(radarSite);

  return (
    <>
      {rangeRings.map((distance) => {
        const radius = projector.projectRadiusNm(radarSite, distance);

        return (
          <g key={`ring-${distance}`}>
            <circle className="radar-ring" cx={center.x} cy={center.y} r={radius} />
            <text
              className="radar-ring-label"
              transform={`translate(${center.x + radius + 8}, ${center.y - 6}) scale(${labelScale})`}
            >
              {distance}
            </text>
          </g>
        );
      })}
    </>
  );
}
