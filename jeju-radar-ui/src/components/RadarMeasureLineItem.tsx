import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import {
  MAX_MEASURE_CHAIN_LEGS,
  estimateMeasureLabelWidth,
  type MeasureLineState
} from "../lib/measureTool";
import {
  measureLineLabel,
  measureLinePoints,
  type RadarMeasureLayerBaseProps
} from "./radarMeasureLayerModel";

interface RadarMeasureLineItemProps extends RadarMeasureLayerBaseProps {
  latestMeasureLineId: string | null;
  measureLine: MeasureLineState;
  measureLineCount: number;
  measureLineIndex: number;
  onMeasureChainPointerDown: (
    event: ReactPointerEvent<SVGCircleElement>,
    sourceLine: MeasureLineState
  ) => void;
  onMeasureLineClick: (event: ReactMouseEvent<SVGElement>) => void;
  onMeasureLineContextMenu: (event: ReactMouseEvent<SVGElement>) => void;
  onMeasureLineMouseDown: (event: ReactMouseEvent<SVGElement>) => void;
  onMeasureLinePointerDown: (event: ReactPointerEvent<SVGElement>) => void;
  onMeasurePointerMove: (event: ReactPointerEvent<SVGElement>) => void;
  onStopMeasureDragging: (event: ReactPointerEvent<SVGElement>) => void;
}

export default function RadarMeasureLineItem(props: RadarMeasureLineItemProps) {
  const { endPoint, midPoint, startPoint } = measureLinePoints(
    props.measureLine,
    props.aircraft,
    props.project
  );
  const canExtendMeasureLine =
    props.measureLine.fixed &&
    props.measureLine.id === props.latestMeasureLineId &&
    props.measureLineCount < MAX_MEASURE_CHAIN_LEGS;
  const label = measureLineLabel(props, props.measureLine, props.measureLineIndex);
  const labelWidth = estimateMeasureLabelWidth(label);

  return (
    <g
      className={props.measureLine.fixed ? "radar-measure-line fixed" : "radar-measure-line active"}
    >
      <line
        className="radar-measure-line-core"
        x1={startPoint.x}
        y1={startPoint.y}
        x2={endPoint.x}
        y2={endPoint.y}
      />
      <g
        className="radar-measure-label-group"
        onContextMenu={
          props.measureLine.fixed ? (event) => props.onMeasureLineContextMenu(event) : undefined
        }
        onPointerDown={
          props.measureLine.fixed ? (event) => props.onMeasureLinePointerDown(event) : undefined
        }
        onMouseDown={
          props.measureLine.fixed ? (event) => props.onMeasureLineMouseDown(event) : undefined
        }
        onClick={props.measureLine.fixed ? (event) => props.onMeasureLineClick(event) : undefined}
        transform={`translate(${midPoint.x}, ${midPoint.y}) scale(${props.labelScale})`}
      >
        <rect
          className="radar-measure-label-hitbox"
          x={-labelWidth / 2 - 5}
          y="-13"
          width={labelWidth + 10}
          height="19"
          onContextMenu={
            props.measureLine.fixed ? (event) => props.onMeasureLineContextMenu(event) : undefined
          }
          onPointerDown={
            props.measureLine.fixed ? (event) => props.onMeasureLinePointerDown(event) : undefined
          }
          onMouseDown={
            props.measureLine.fixed ? (event) => props.onMeasureLineMouseDown(event) : undefined
          }
          onClick={props.measureLine.fixed ? (event) => props.onMeasureLineClick(event) : undefined}
          rx="3"
        />
        <rect
          className="radar-measure-label-bg"
          x={-labelWidth / 2}
          y="-10"
          width={labelWidth}
          height="13"
          onContextMenu={
            props.measureLine.fixed ? (event) => props.onMeasureLineContextMenu(event) : undefined
          }
          onPointerDown={
            props.measureLine.fixed ? (event) => props.onMeasureLinePointerDown(event) : undefined
          }
          onMouseDown={
            props.measureLine.fixed ? (event) => props.onMeasureLineMouseDown(event) : undefined
          }
          onClick={props.measureLine.fixed ? (event) => props.onMeasureLineClick(event) : undefined}
          rx="2"
        />
        <text className="radar-measure-label" x="0" y="0" textAnchor="middle">
          {label}
        </text>
      </g>
      {canExtendMeasureLine ? (
        <>
          <circle
            className="radar-measure-chain-hitbox"
            cx={endPoint.x}
            cy={endPoint.y}
            onLostPointerCapture={(event) => props.onStopMeasureDragging(event)}
            onPointerCancel={(event) => props.onStopMeasureDragging(event)}
            onPointerDown={(event) => props.onMeasureChainPointerDown(event, props.measureLine)}
            onPointerMove={(event) => props.onMeasurePointerMove(event)}
            onPointerUp={(event) => props.onStopMeasureDragging(event)}
            r="18"
          />
          <circle
            className="radar-measure-chain-anchor"
            cx={endPoint.x}
            cy={endPoint.y}
            onLostPointerCapture={(event) => props.onStopMeasureDragging(event)}
            onPointerCancel={(event) => props.onStopMeasureDragging(event)}
            onPointerDown={(event) => props.onMeasureChainPointerDown(event, props.measureLine)}
            onPointerMove={(event) => props.onMeasurePointerMove(event)}
            onPointerUp={(event) => props.onStopMeasureDragging(event)}
            r="5.5"
          />
        </>
      ) : null}
    </g>
  );
}
