import type { RunwayMode } from "../lib/types";

interface RadarMapHudProps {
  activeOverlayNames: string[];
  aircraftCount: number;
  airportIcao: string;
  selectedRunway: RunwayMode;
  showChrome: boolean;
  tmaFeatureCount: number;
  visibleLabelCount: number;
}

export function RadarMapHud({
  activeOverlayNames,
  aircraftCount,
  airportIcao,
  selectedRunway,
  showChrome,
  tmaFeatureCount,
  visibleLabelCount
}: RadarMapHudProps) {
  if (!showChrome) {
    return null;
  }

  return (
    <>
      <div className="scope-hud top-left">
        <span>{airportIcao}</span>
        <span>JEJU TMA ENR</span>
        <span>RWY {selectedRunway}</span>
      </div>
      <div className="scope-hud top-right">
        <span>EXACT</span>
        <span>TMA DISPLAY</span>
        <span>{aircraftCount} ACFT</span>
      </div>
      <div className="scope-hud bottom-left">
        <span>{activeOverlayNames.join(" / ")}</span>
      </div>
      <div className="scope-hud bottom-right">
        <span>TMA {tmaFeatureCount}</span>
        <span>FIX {visibleLabelCount}</span>
      </div>
    </>
  );
}
