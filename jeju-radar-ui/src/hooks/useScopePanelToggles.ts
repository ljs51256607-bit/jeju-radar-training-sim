import type { Dispatch, SetStateAction } from "react";
import type { TrafficPanelMode } from "../lib/trafficPanelMode";

interface UseScopePanelTogglesOptions {
  closeScenarioStoragePanel: () => void;
  closeTrafficPanel: () => void;
  closeWindPanel: () => void;
  openScenarioStoragePanel: () => void;
  openTrafficPanelState: (mode: TrafficPanelMode) => void;
  resetAircraftCreateUi: () => void;
  scenarioStoragePanelOpen: boolean;
  setControlPanelOpen: Dispatch<SetStateAction<boolean>>;
  setScenarioPanelOpen: Dispatch<SetStateAction<boolean>>;
  toggleTrafficPanelState: () => boolean;
  trafficPanelMode: TrafficPanelMode;
}

export function useScopePanelToggles({
  closeScenarioStoragePanel,
  closeTrafficPanel,
  closeWindPanel,
  openScenarioStoragePanel,
  openTrafficPanelState,
  resetAircraftCreateUi,
  scenarioStoragePanelOpen,
  setControlPanelOpen,
  setScenarioPanelOpen,
  toggleTrafficPanelState,
  trafficPanelMode
}: UseScopePanelTogglesOptions) {
  function openTrafficPanel(mode: TrafficPanelMode) {
    setControlPanelOpen(false);
    closeWindPanel();
    closeScenarioStoragePanel();
    openTrafficPanelState(mode);
  }

  function toggleTrafficPanel() {
    if (toggleTrafficPanelState()) {
      return;
    }

    openTrafficPanel(trafficPanelMode);
  }

  function toggleScenarioStoragePanel() {
    if (scenarioStoragePanelOpen) {
      closeScenarioStoragePanel();
      return;
    }

    closeTrafficPanel();
    setControlPanelOpen(false);
    closeWindPanel();
    openScenarioStoragePanel();
  }

  function handleBeginMeasure() {
    setControlPanelOpen(false);
    resetAircraftCreateUi();
    setScenarioPanelOpen(false);
    closeWindPanel();
    closeScenarioStoragePanel();
  }

  return {
    handleBeginMeasure,
    openTrafficPanel,
    toggleScenarioStoragePanel,
    toggleTrafficPanel
  };
}
