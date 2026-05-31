import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent
} from "react";
import type { MeasureLineState } from "../lib/measureTool";
import type { ScreenPoint } from "../lib/radarMapLayout";
import RadarMeasureDeleteOverlayItem from "./RadarMeasureDeleteOverlayItem";
import RadarMeasureHtmlDeleteButton from "./RadarMeasureHtmlDeleteButton";
import RadarMeasureLineItem from "./RadarMeasureLineItem";
import type { RadarMeasureLayerBaseProps } from "./radarMeasureLayerModel";

interface RadarMeasureLayerProps extends RadarMeasureLayerBaseProps {
  latestMeasureLineId: string | null;
  measureLineCount: number;
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

interface RadarMeasureDeleteOverlayProps extends RadarMeasureLayerBaseProps {
  onClearMeasureLines: () => void;
  onMeasureLineClick: (event: ReactMouseEvent<SVGElement>) => void;
  onMeasureLineContextMenu: (event: ReactMouseEvent<SVGElement>) => void;
  onMeasureLineMouseDown: (event: ReactMouseEvent<SVGElement>) => void;
  onMeasureLinePointerDown: (event: ReactPointerEvent<SVGElement>) => void;
}

interface RadarMeasureHtmlDeleteButtonsProps extends RadarMeasureLayerBaseProps {
  mapPointToShellPoint: (point: ScreenPoint) => { x: number; y: number; scale: number } | null;
  onClearMeasureLines: () => void;
}

export default function RadarMeasureLayer(props: RadarMeasureLayerProps) {
  return (
    <>
      {props.renderedMeasureLines.map((measureLine, measureLineIndex) => (
        <RadarMeasureLineItem
          key={measureLine.id}
          {...props}
          measureLine={measureLine}
          measureLineIndex={measureLineIndex}
        />
      ))}
    </>
  );
}

export function RadarMeasureDeleteOverlay(props: RadarMeasureDeleteOverlayProps) {
  return (
    <>
      {props.renderedMeasureLines.map((measureLine, measureLineIndex) => {
        if (!measureLine.fixed) {
          return null;
        }

        return (
          <RadarMeasureDeleteOverlayItem
            key={`${measureLine.id}-delete-overlay`}
            {...props}
            measureLine={measureLine}
            measureLineIndex={measureLineIndex}
          />
        );
      })}
    </>
  );
}

export function RadarMeasureHtmlDeleteButtons(props: RadarMeasureHtmlDeleteButtonsProps) {
  return (
    <>
      {props.renderedMeasureLines.map((measureLine, measureLineIndex) => {
        if (!measureLine.fixed) {
          return null;
        }

        return (
          <RadarMeasureHtmlDeleteButton
            key={`${measureLine.id}-html-delete`}
            {...props}
            measureLine={measureLine}
            measureLineIndex={measureLineIndex}
          />
        );
      })}
    </>
  );
}
