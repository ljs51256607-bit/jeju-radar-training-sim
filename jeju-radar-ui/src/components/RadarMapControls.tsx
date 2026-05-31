import type {
  DensityMode,
  SurfaceMode
} from "../lib/types";
import type { RadarScaleReadout } from "../lib/radarScaleReadout";

interface RadarMapControlsProps {
  densityMode: DensityMode;
  lastRadarUpdateAt: number | null;
  onClearMeasureLines: () => void;
  onResetViewport: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  radarPaused: boolean;
  scaleReadout: RadarScaleReadout;
  showChrome: boolean;
  surfaceMode: SurfaceMode;
  zoomLod: string;
  zoomScale: number;
}

export default function RadarMapControls({
  densityMode,
  lastRadarUpdateAt,
  onClearMeasureLines,
  onResetViewport,
  onZoomIn,
  onZoomOut,
  radarPaused,
  scaleReadout,
  showChrome,
  surfaceMode,
  zoomLod,
  zoomScale
}: RadarMapControlsProps) {
  return (
    <div className="scope-map-tools">
      <button className="map-tool-button" onClick={onZoomIn} type="button">
        +
      </button>
      <button className="map-tool-button" onClick={onZoomOut} type="button">
        -
      </button>
      <button
        className="map-tool-button reset"
        onClick={onResetViewport}
        type="button"
      >
        Fit
      </button>
      <button className="map-tool-button reset" onClick={onClearMeasureLines} type="button">
        CLR
      </button>
      {showChrome ? (
        <div className="map-tool-readout">
          <span>TMA</span>
          <span>{surfaceMode.toUpperCase()}</span>
          <span>{densityMode.toUpperCase()}</span>
          <span>LOD {zoomLod}</span>
          <span>{zoomScale.toFixed(1)}x</span>
          <span data-testid="radar-range-readout">{scaleReadout.rangeLabel}</span>
          <span data-testid="radar-vertical-range-readout">{scaleReadout.verticalRangeLabel}</span>
          <span className="map-tool-scale-readout">
            <span>{scaleReadout.scaleBarLabel}</span>
            <span
              className="map-tool-scale-bar"
              data-testid="radar-scale-bar"
              style={{ width: `${scaleReadout.scaleBarWidthPx}px` }}
            />
          </span>
          <span>{radarPaused ? "HOLD" : "3 SEC"}</span>
          <span>{lastRadarUpdateAt ? new Date(lastRadarUpdateAt).toLocaleTimeString("ko-KR") : "--:--:--"}</span>
        </div>
      ) : null}
    </div>
  );
}
