import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import {
  directLabelHitbox,
  fixCrossClassName,
  fixSymbolClassName,
  isDirectableFixLabel,
  labelClassName,
  type PlacedMapLabel
} from "../lib/radarMapLayout";
import type { MapLabel } from "../lib/types";

interface RadarLabelLayerProps {
  fixSpawnPickActive: boolean;
  labelScale: number;
  onDirectFixClick: (event: ReactMouseEvent<SVGElement>, label: MapLabel) => void;
  onDirectFixMouseDown: (event: ReactMouseEvent<SVGElement>, label: MapLabel) => void;
  onDirectFixPointerDown: (event: ReactPointerEvent<SVGElement>, label: MapLabel) => void;
  placedLabels: PlacedMapLabel[];
  selectedAircraftDirectFixId: string | null;
  selectedAircraftId: string | null;
}

export default function RadarLabelLayer({
  fixSpawnPickActive,
  labelScale,
  onDirectFixClick,
  onDirectFixMouseDown,
  onDirectFixPointerDown,
  placedLabels,
  selectedAircraftDirectFixId,
  selectedAircraftId
}: RadarLabelLayerProps) {
  return (
    <>
      {placedLabels.map(({ label, point, highlight, pointOnly, textPlacement }) => {
        const directableFix = Boolean(selectedAircraftId) && isDirectableFixLabel(label);
        const spawnPickableFix = fixSpawnPickActive && isDirectableFixLabel(label);
        const interactiveFix = directableFix || spawnPickableFix;
        const directTarget =
          selectedAircraftDirectFixId !== null &&
          label.text.toUpperCase() === selectedAircraftDirectFixId.toUpperCase();
        const labelHitbox = directLabelHitbox(label, textPlacement);

        return (
          <g
            className={[
              "radar-fix-group",
              directableFix ? "directable" : "",
              spawnPickableFix ? "spawn-pickable" : "",
              directTarget ? "direct-target" : ""
            ]
              .filter(Boolean)
              .join(" ")}
            key={label.id}
            data-direct-target={directTarget ? "true" : undefined}
            data-directable={directableFix ? "true" : undefined}
            data-fix-id={label.text}
            data-spawn-pickable={spawnPickableFix ? "true" : undefined}
            onClick={(event) => onDirectFixClick(event, label)}
            onMouseDown={(event) => onDirectFixMouseDown(event, label)}
            onPointerDown={(event) => onDirectFixPointerDown(event, label)}
            transform={`translate(${point.x}, ${point.y}) scale(${labelScale})`}
          >
            {interactiveFix ? (
              <>
                <circle
                  className="radar-direct-fix-hitbox"
                  onClick={(event) => onDirectFixClick(event, label)}
                  onMouseDown={(event) => onDirectFixMouseDown(event, label)}
                  onPointerDown={(event) => onDirectFixPointerDown(event, label)}
                  r="9"
                />
                {pointOnly ? null : (
                  <rect
                    className="radar-direct-label-hitbox"
                    height={labelHitbox.height}
                    onClick={(event) => onDirectFixClick(event, label)}
                    onMouseDown={(event) => onDirectFixMouseDown(event, label)}
                    onPointerDown={(event) => onDirectFixPointerDown(event, label)}
                    width={labelHitbox.width}
                    x={labelHitbox.x}
                    y={labelHitbox.y}
                  />
                )}
              </>
            ) : null}
            <path
              className={fixSymbolClassName(label, highlight)}
              d="M 0 -8 L 5 0 L 0 8 L -5 0 Z"
            />
            <line className={fixCrossClassName(label)} x1="-7" y1="0" x2="7" y2="0" />
            <line className={fixCrossClassName(label)} x1="0" y1="-7" x2="0" y2="7" />
            {pointOnly ? null : (
              <text
                className={labelClassName(label, highlight)}
                x={textPlacement.x}
                y={textPlacement.y}
                textAnchor={textPlacement.textAnchor}
              >
                {label.text}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}
