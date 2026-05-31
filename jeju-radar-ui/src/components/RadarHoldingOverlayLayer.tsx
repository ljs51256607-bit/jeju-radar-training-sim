import type { HoldingOverlayGeometry } from "../lib/holdingOverlayGeometry";

interface RadarHoldingOverlayLayerProps {
  holdingOverlays: HoldingOverlayGeometry[];
  labelScale: number;
}

export default function RadarHoldingOverlayLayer({
  holdingOverlays,
  labelScale
}: RadarHoldingOverlayLayerProps) {
  return (
    <>
      {holdingOverlays.map((holdOverlay) => (
        <g
          key={holdOverlay.id}
          className={`radar-holding-pattern holding-${holdOverlay.kind}`}
        >
          <path d={holdOverlay.pathD} />
          <text
            transform={`translate(${holdOverlay.labelPoint.x}, ${holdOverlay.labelPoint.y}) scale(${labelScale})`}
          >
            {holdOverlay.label}
          </text>
        </g>
      ))}
    </>
  );
}
