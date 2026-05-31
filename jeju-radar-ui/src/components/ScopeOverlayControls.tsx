import AtcCommandConsole, { type AtcCommandConsoleProps } from "./AtcCommandConsole";
import type { ScenarioOverlayState } from "../lib/scenarioStorage";
import type { DensityMode, RunwayMode, SurfaceMode } from "../lib/types";

const runwayModes: RunwayMode[] = ["07", "25"];
const surfaceModes: SurfaceMode[] = ["exact", "training"];
const densityModes: DensityMode[] = ["full", "balanced", "declutter"];

interface ScopeOverlayControlsProps {
  approachCount: number;
  atcCommandConsoleProps: AtcCommandConsoleProps;
  compactOverlayKeys: Array<keyof ScenarioOverlayState>;
  densityMode: DensityMode;
  effectiveOverlays: ScenarioOverlayState;
  exactOverlayCount: number;
  onDensityModeChange: (mode: DensityMode) => void;
  onRunwayModeChange: (runway: RunwayMode) => void;
  onSurfaceModeChange: (mode: SurfaceMode) => void;
  onToggleOverlay: (key: keyof ScenarioOverlayState) => void;
  overlayLabels: Record<keyof ScenarioOverlayState, string>;
  overlays: ScenarioOverlayState;
  radarStatusLabel: string;
  selectedRunway: RunwayMode;
  sidCount: number;
  starCount: number;
  supportOverlayCount: number;
  supportOverlayKeys: Array<keyof ScenarioOverlayState>;
  surfaceMode: SurfaceMode;
  visibleAircraftCount: number;
}

export default function ScopeOverlayControls({
  approachCount,
  atcCommandConsoleProps,
  compactOverlayKeys,
  densityMode,
  effectiveOverlays,
  exactOverlayCount,
  onDensityModeChange,
  onRunwayModeChange,
  onSurfaceModeChange,
  onToggleOverlay,
  overlayLabels,
  overlays,
  radarStatusLabel,
  selectedRunway,
  sidCount,
  starCount,
  supportOverlayCount,
  supportOverlayKeys,
  surfaceMode,
  visibleAircraftCount
}: ScopeOverlayControlsProps) {
  return (
    <div className="scope-overlay-controls">
      <div className="scope-mini-brand">
        <span>RKPC</span>
        <strong>JEJU TMA ENR</strong>
        <span>
          STAR/SID/APP {starCount}/{sidCount}/{approachCount}
        </span>
      </div>

      <AtcCommandConsole {...atcCommandConsoleProps} />

      <div className="scope-control-group">
        {runwayModes.map((runway) => (
          <button
            key={runway}
            className={selectedRunway === runway ? "scope-chip active" : "scope-chip"}
            onClick={() => onRunwayModeChange(runway)}
            type="button"
          >
            {runway === "25" ? "RWY 25+31" : `RWY ${runway}`}
          </button>
        ))}
      </div>

      <div className="scope-control-group">
        {surfaceModes.map((mode) => (
          <button
            key={mode}
            className={surfaceMode === mode ? "scope-chip active" : "scope-chip"}
            onClick={() => onSurfaceModeChange(mode)}
            type="button"
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="scope-control-group">
        {densityModes.map((mode) => (
          <button
            key={mode}
            className={densityMode === mode ? "scope-chip active" : "scope-chip"}
            onClick={() => onDensityModeChange(mode)}
            type="button"
          >
            {mode}
          </button>
        ))}
      </div>

      <div className="scope-control-group overlays">
        {compactOverlayKeys.map((key) => (
          <label className="scope-chip toggle" key={key}>
            <input
              checked={overlays[key]}
              onChange={() => onToggleOverlay(key)}
              type="checkbox"
            />
            <span>{overlayLabels[key]}</span>
          </label>
        ))}
      </div>

      <div className="scope-control-group support-overlays">
        {supportOverlayKeys.map((key) => (
          <label
            className={surfaceMode === "exact" ? "scope-chip toggle disabled" : "scope-chip toggle"}
            key={key}
          >
            <input
              checked={effectiveOverlays[key]}
              disabled={surfaceMode === "exact"}
              onChange={() => onToggleOverlay(key)}
              type="checkbox"
            />
            <span>{overlayLabels[key]}</span>
          </label>
        ))}
      </div>

      <div className="scope-mini-status">
        <span>EXACT {exactOverlayCount}</span>
        <span>SUP {supportOverlayCount}</span>
        <span>ACFT {visibleAircraftCount}</span>
        <span>{radarStatusLabel}</span>
      </div>
    </div>
  );
}
