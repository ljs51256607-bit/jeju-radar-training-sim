import type { ScreenPoint } from "../lib/radarMapLayout";

interface RadarSpawnPickMarkerProps {
  point: ScreenPoint | null;
}

export default function RadarSpawnPickMarker({
  point
}: RadarSpawnPickMarkerProps) {
  if (!point) {
    return null;
  }

  return (
    <g className="radar-spawn-pick" transform={`translate(${point.x}, ${point.y})`}>
      <circle r="7.5" />
      <line x1="-13" y1="0" x2="-4" y2="0" />
      <line x1="4" y1="0" x2="13" y2="0" />
      <line x1="0" y1="-13" x2="0" y2="-4" />
      <line x1="0" y1="4" x2="0" y2="13" />
      <text x="12" y="-10">SPAWN</text>
    </g>
  );
}
