import {
  estimateMeasureLabelWidth,
  type MeasureLineState
} from "../lib/measureTool";
import type { ScreenPoint } from "../lib/radarMapLayout";
import {
  measureLineLabel,
  measureLinePoints,
  type RadarMeasureLayerBaseProps
} from "./radarMeasureLayerModel";

interface RadarMeasureHtmlDeleteButtonProps extends RadarMeasureLayerBaseProps {
  mapPointToShellPoint: (point: ScreenPoint) => { x: number; y: number; scale: number } | null;
  measureLine: MeasureLineState;
  measureLineIndex: number;
  onClearMeasureLines: () => void;
}

export default function RadarMeasureHtmlDeleteButton(props: RadarMeasureHtmlDeleteButtonProps) {
  const { midPoint } = measureLinePoints(props.measureLine, props.aircraft, props.project);
  const shellPoint = props.mapPointToShellPoint(midPoint);

  if (!shellPoint) {
    return null;
  }

  const label = measureLineLabel(props, props.measureLine, props.measureLineIndex);
  const buttonWidth = Math.max(
    34,
    (estimateMeasureLabelWidth(label) + 18) * props.labelScale * shellPoint.scale
  );
  const buttonHeight = Math.max(16, 25 * props.labelScale * shellPoint.scale);

  return (
    <button
      aria-label="Clear measure chain"
      className="radar-measure-html-delete-button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onClearMeasureLines();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      style={{
        height: `${buttonHeight}px`,
        left: `${shellPoint.x - buttonWidth / 2}px`,
        top: `${shellPoint.y - buttonHeight / 2}px`,
        width: `${buttonWidth}px`
      }}
      type="button"
    />
  );
}
