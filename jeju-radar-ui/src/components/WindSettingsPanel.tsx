import type { WindLayer, WindSettings } from "../lib/types";
import { windLayerRangeLabel, windLayerSummary } from "../lib/windModel";

interface WindSettingsPanelProps {
  onCalm: () => void;
  onClose: () => void;
  onEnabledChange: (enabled: boolean) => void;
  onLayerChange: (altitudeFt: number, field: "direction_from_deg" | "speed_kt", value: string) => void;
  onRandom: () => void;
  windSettings: WindSettings;
}

export default function WindSettingsPanel({
  onCalm,
  onClose,
  onEnabledChange,
  onLayerChange,
  onRandom,
  windSettings
}: WindSettingsPanelProps) {
  const sampleAltitudesFt = [0, 3000, 9000, 15000];

  return (
    <section className="scenario-stream-panel wind-settings-panel" aria-label="Wind settings panel">
      <div className="aircraft-control-header">
        <div>
          <span>WEATHER</span>
          <strong>ALTITUDE WIND</strong>
        </div>
        <button className="aircraft-control-close" onClick={onClose} type="button">
          X
        </button>
      </div>

      <div className="wind-enable-row">
        <label>
          <input
            checked={windSettings.enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
            type="checkbox"
          />
          WIND EFFECT
        </label>
        <span>{windSettings.enabled ? "ENABLED" : "CALM/OFF"}</span>
      </div>

      <div className="wind-layer-table" role="table" aria-label="Altitude wind layers">
        <div className="wind-layer-row wind-layer-head" role="row">
          <span>LAYER</span>
          <span>DIR FROM</span>
          <span>SPD</span>
        </div>
        {windSettings.layers.map((layer: WindLayer) => (
          <div className="wind-layer-row" key={layer.altitude_ft} role="row">
            <span>{windLayerRangeLabel(layer.altitude_ft)}</span>
            <input
              aria-label={`${windLayerRangeLabel(layer.altitude_ft)} feet wind direction from`}
              inputMode="numeric"
              max="359"
              min="0"
              onChange={(event) => onLayerChange(layer.altitude_ft, "direction_from_deg", event.target.value)}
              type="number"
              value={Math.round(layer.direction_from_deg)}
            />
            <input
              aria-label={`${windLayerRangeLabel(layer.altitude_ft)} feet wind speed`}
              inputMode="numeric"
              max="200"
              min="0"
              onChange={(event) => onLayerChange(layer.altitude_ft, "speed_kt", event.target.value)}
              type="number"
              value={Math.round(layer.speed_kt)}
            />
          </div>
        ))}
      </div>

      <div className="wind-sample-grid">
        {sampleAltitudesFt.map((altitudeFt) => (
          <span key={altitudeFt}>
            {altitudeFt} {windLayerSummary(windSettings, altitudeFt)}
          </span>
        ))}
      </div>

      <div className="scenario-stream-actions two">
        <button className="scenario-stream-secondary" onClick={onCalm} type="button">
          CALM
        </button>
        <button className="aircraft-control-apply" onClick={onRandom} type="button">
          RANDOM
        </button>
      </div>
    </section>
  );
}
