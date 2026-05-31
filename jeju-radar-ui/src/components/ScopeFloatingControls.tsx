import {
  SIMULATION_SPEED_OPTIONS,
  type SimulationSpeed
} from "../lib/scenarioStorage";

interface ScopeFloatingControlsProps {
  onSimulationSpeedChange: (speed: SimulationSpeed) => void;
  onToggleChrome: () => void;
  onToggleRadarPause: () => void;
  onToggleScenarioStoragePanel: () => void;
  onToggleTrafficPanel: () => void;
  onToggleWindPanel: () => void;
  radarPaused: boolean;
  scenarioStoragePanelOpen: boolean;
  showChrome: boolean;
  simulationSpeed: SimulationSpeed;
  trafficPanelOpen: boolean;
  windEnabled: boolean;
  windPanelOpen: boolean;
}

export default function ScopeFloatingControls({
  onSimulationSpeedChange,
  onToggleChrome,
  onToggleRadarPause,
  onToggleScenarioStoragePanel,
  onToggleTrafficPanel,
  onToggleWindPanel,
  radarPaused,
  scenarioStoragePanelOpen,
  showChrome,
  simulationSpeed,
  trafficPanelOpen,
  windEnabled,
  windPanelOpen
}: ScopeFloatingControlsProps) {
  return (
    <>
      <button
        className={showChrome ? "scope-chrome-toggle active" : "scope-chrome-toggle"}
        data-testid="scope-chrome-toggle"
        onClick={onToggleChrome}
        type="button"
      >
        {showChrome ? "HIDE" : "UI"}
      </button>

      <button
        className={radarPaused ? "scope-radar-pause paused" : "scope-radar-pause"}
        data-testid="scope-radar-pause-toggle"
        onClick={onToggleRadarPause}
        type="button"
      >
        {radarPaused ? "RESUME" : "PAUSE"}
      </button>

      <div className="scope-speed-control" aria-label="Simulation speed">
        {SIMULATION_SPEED_OPTIONS.map((speed) => (
          <button
            className={simulationSpeed === speed ? "scope-speed-chip active" : "scope-speed-chip"}
            data-testid={`scope-speed-${speed}`}
            key={speed}
            onClick={() => onSimulationSpeedChange(speed)}
            type="button"
          >
            {speed}x
          </button>
        ))}
      </div>

      <button
        className={trafficPanelOpen ? "scope-traffic-toggle active" : "scope-traffic-toggle"}
        data-testid="scope-traffic-toggle"
        onClick={onToggleTrafficPanel}
        type="button"
      >
        TRAFFIC
      </button>

      <button
        className={scenarioStoragePanelOpen ? "scope-scenario-toggle active" : "scope-scenario-toggle"}
        data-testid="scope-scenario-toggle"
        onClick={onToggleScenarioStoragePanel}
        type="button"
      >
        SCEN
      </button>

      <button
        className={windPanelOpen || windEnabled ? "scope-wind-toggle active" : "scope-wind-toggle"}
        data-testid="scope-wind-toggle"
        onClick={onToggleWindPanel}
        type="button"
      >
        WIND
      </button>
    </>
  );
}
