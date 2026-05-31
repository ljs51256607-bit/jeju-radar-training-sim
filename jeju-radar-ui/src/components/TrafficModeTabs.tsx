import type { TrafficPanelMode } from "../lib/trafficPanelMode";

interface TrafficModeTabsProps {
  activeMode: TrafficPanelMode;
  onModeChange: (mode: TrafficPanelMode) => void;
}

export default function TrafficModeTabs({ activeMode, onModeChange }: TrafficModeTabsProps) {
  return (
    <div className="traffic-mode-row">
      <button
        className={activeMode === "fix" ? "active" : ""}
        onClick={() => onModeChange("fix")}
        type="button"
      >
        FIX STAR
      </button>
      <button
        className={activeMode === "map" ? "active" : ""}
        onClick={() => onModeChange("map")}
        type="button"
      >
        MAP HDG
      </button>
      <button
        className={activeMode === "stream" ? "active" : ""}
        onClick={() => onModeChange("stream")}
        type="button"
      >
        STREAM
      </button>
    </div>
  );
}
