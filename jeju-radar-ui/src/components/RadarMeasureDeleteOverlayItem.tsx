import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import {
  estimateMeasureLabelWidth,
  type MeasureLineState
} from "../lib/measureTool";
import {
  measureLineLabel,
  measureLinePoints,
  type RadarMeasureLayerBaseProps
} from "./radarMeasureLayerModel";

interface RadarMeasureDeleteOverlayItemProps extends RadarMeasureLayerBaseProps {
  measureLine: MeasureLineState;
  measureLineIndex: number;
  onClearMeasureLines: () => void;
  onMeasureLineClick: (event: ReactMouseEvent<SVGElement>) => void;
  onMeasureLineContextMenu: (event: ReactMouseEvent<SVGElement>) => void;
  onMeasureLineMouseDown: (event: ReactMouseEvent<SVGElement>) => void;
  onMeasureLinePointerDown: (event: ReactPointerEvent<SVGElement>) => void;
}

export default function RadarMeasureDeleteOverlayItem(
  props: RadarMeasureDeleteOverlayItemProps
) {
  const { endPoint, midPoint, startPoint } = measureLinePoints(
    props.measureLine,
    props.aircraft,
    props.project
  );
  const deleteLineStartPoint = {
    x: startPoint.x + (endPoint.x - startPoint.x) * 0.35,
    y: startPoint.y + (endPoint.y - startPoint.y) * 0.35
  };
  const deleteLineEndPoint = {
    x: startPoint.x + (endPoint.x - startPoint.x) * 0.65,
    y: startPoint.y + (endPoint.y - startPoint.y) * 0.65
  };
  const label = measureLineLabel(props, props.measureLine, props.measureLineIndex);
  const labelWidth = estimateMeasureLabelWidth(label);
  const deleteButtonWidth = (labelWidth + 14) * props.labelScale;
  const deleteButtonHeight = 23 * props.labelScale;

  return (
    <g className="radar-measure-delete-overlay">
      <line
        className="radar-measure-delete-line-hitbox"
        x1={deleteLineStartPoint.x}
        y1={deleteLineStartPoint.y}
        x2={deleteLineEndPoint.x}
        y2={deleteLineEndPoint.y}
        onContextMenu={(event) => props.onMeasureLineContextMenu(event)}
        onPointerDown={(event) => props.onMeasureLinePointerDown(event)}
        onMouseDown={(event) => props.onMeasureLineMouseDown(event)}
        onClick={(event) => props.onMeasureLineClick(event)}
      />
      <g transform={`translate(${midPoint.x}, ${midPoint.y}) scale(${props.labelScale})`}>
        <rect
          className="radar-measure-delete-hitbox"
          x={-labelWidth / 2 - 7}
          y="-15"
          width={labelWidth + 14}
          height="23"
          onContextMenu={(event) => props.onMeasureLineContextMenu(event)}
          onPointerDown={(event) => props.onMeasureLinePointerDown(event)}
          onMouseDown={(event) => props.onMeasureLineMouseDown(event)}
          onClick={(event) => props.onMeasureLineClick(event)}
          rx="4"
        />
      </g>
      <foreignObject
        className="radar-measure-delete-foreign-object"
        x={midPoint.x - deleteButtonWidth / 2}
        y={midPoint.y - 15 * props.labelScale}
        width={deleteButtonWidth}
        height={deleteButtonHeight}
      >
        <button
          aria-label="Clear measure chain"
          className="radar-measure-delete-button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            props.onClearMeasureLines();
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          type="button"
        />
      </foreignObject>
    </g>
  );
}
