import type { ComponentProps } from "react";
import AircraftCreatePanel from "./AircraftCreatePanel";
import ScenarioStoragePanel from "./ScenarioStoragePanel";
import ScenarioStreamPanel from "./ScenarioStreamPanel";
import WindSettingsPanel from "./WindSettingsPanel";

interface ScenarioSidePanelsProps {
  aircraftCreatePanelOpen: boolean;
  aircraftCreatePanelProps: ComponentProps<typeof AircraftCreatePanel>;
  scenarioStoragePanelOpen: boolean;
  scenarioStoragePanelProps: ComponentProps<typeof ScenarioStoragePanel>;
  scenarioStreamPanelOpen: boolean;
  scenarioStreamPanelProps: ComponentProps<typeof ScenarioStreamPanel>;
  windPanelOpen: boolean;
  windSettingsPanelProps: ComponentProps<typeof WindSettingsPanel>;
}

export default function ScenarioSidePanels({
  aircraftCreatePanelOpen,
  aircraftCreatePanelProps,
  scenarioStoragePanelOpen,
  scenarioStoragePanelProps,
  scenarioStreamPanelOpen,
  scenarioStreamPanelProps,
  windPanelOpen,
  windSettingsPanelProps
}: ScenarioSidePanelsProps) {
  return (
    <>
      {scenarioStoragePanelOpen ? (
        <ScenarioStoragePanel {...scenarioStoragePanelProps} />
      ) : null}

      {scenarioStreamPanelOpen ? (
        <ScenarioStreamPanel {...scenarioStreamPanelProps} />
      ) : null}

      {windPanelOpen ? (
        <WindSettingsPanel {...windSettingsPanelProps} />
      ) : null}

      {aircraftCreatePanelOpen ? (
        <AircraftCreatePanel {...aircraftCreatePanelProps} />
      ) : null}
    </>
  );
}
