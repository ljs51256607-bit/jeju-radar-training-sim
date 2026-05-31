import { useState } from "react";
import type { ScenarioOverlayState } from "../lib/scenarioStorage";
import { DEFAULT_SCENARIO_OVERLAYS } from "../lib/scopeViewModel";

export function useScopeOverlayController() {
  const [overlays, setOverlays] = useState(DEFAULT_SCENARIO_OVERLAYS);

  function handleToggleOverlay(key: keyof ScenarioOverlayState) {
    setOverlays((previous) => ({
      ...previous,
      [key]: !previous[key]
    }));
  }

  return {
    handleToggleOverlay,
    overlays,
    setOverlays
  };
}
