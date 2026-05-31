import { useState, type Dispatch, type SetStateAction } from "react";
import type { WindSettings } from "../lib/types";
import {
  calmWindSettings,
  defaultWindSettings,
  normalizeWindSettings,
  randomWindSettings
} from "../lib/windModel";

type WindLayerEditField = "direction_from_deg" | "speed_kt";

interface UseWindSettingsControllerOptions {
  closeScenarioStoragePanel: () => void;
  closeTrafficPanel: () => void;
  setControlPanelOpen: Dispatch<SetStateAction<boolean>>;
}

export function useWindSettingsController({
  closeScenarioStoragePanel,
  closeTrafficPanel,
  setControlPanelOpen
}: UseWindSettingsControllerOptions) {
  const [windPanelOpen, setWindPanelOpen] = useState(false);
  const [windSettings, setWindSettings] = useState<WindSettings>(defaultWindSettings);

  function closeWindPanel() {
    setWindPanelOpen(false);
  }

  function toggleWindPanel() {
    if (windPanelOpen) {
      closeWindPanel();
      return;
    }

    closeTrafficPanel();
    closeScenarioStoragePanel();
    setControlPanelOpen(false);
    setWindPanelOpen(true);
  }

  function handleWindEnabledChange(enabled: boolean) {
    setWindSettings((currentSettings) => ({
      ...normalizeWindSettings(currentSettings),
      enabled
    }));
  }

  function handleWindLayerChange(
    altitudeFt: number,
    field: WindLayerEditField,
    value: string
  ) {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return;
    }

    setWindSettings((currentSettings) => {
      const normalizedSettings = normalizeWindSettings(currentSettings);

      return {
        ...normalizedSettings,
        layers: normalizedSettings.layers.map((layer) =>
          layer.altitude_ft === altitudeFt
            ? {
                ...layer,
                [field]: field === "direction_from_deg"
                  ? ((numericValue % 360) + 360) % 360
                  : Math.min(200, Math.max(0, numericValue))
              }
            : layer
        )
      };
    });
  }

  function handleCalmWind() {
    setWindSettings(calmWindSettings(false));
  }

  function handleRandomWind() {
    setWindSettings(randomWindSettings());
  }

  return {
    closeWindPanel,
    handleCalmWind,
    handleRandomWind,
    handleWindEnabledChange,
    handleWindLayerChange,
    setWindSettings,
    toggleWindPanel,
    windPanelOpen,
    windSettings
  };
}
