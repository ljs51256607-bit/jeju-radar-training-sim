export interface ProjectedSegment {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

interface RadarRunwayBarProps {
  primaryRunwayBar: ProjectedSegment | null;
}

export default function RadarRunwayBar({ primaryRunwayBar }: RadarRunwayBarProps) {
  if (!primaryRunwayBar) {
    return null;
  }

  return (
    <g className="radar-runway-bar">
      <line
        className="radar-runway-bar-shadow"
        x1={primaryRunwayBar.start.x}
        y1={primaryRunwayBar.start.y}
        x2={primaryRunwayBar.end.x}
        y2={primaryRunwayBar.end.y}
      />
      <line
        className="radar-runway-bar-core"
        x1={primaryRunwayBar.start.x}
        y1={primaryRunwayBar.start.y}
        x2={primaryRunwayBar.end.x}
        y2={primaryRunwayBar.end.y}
      />
    </g>
  );
}
