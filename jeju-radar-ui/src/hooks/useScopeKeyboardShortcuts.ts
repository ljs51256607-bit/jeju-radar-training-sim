import { useEffect } from "react";
import {
  type ScopeKeyboardControlField,
  scopeKeyboardShortcutAction,
  scopeKeyboardShortcutTargetKindForElement
} from "../lib/scopeKeyboardShortcuts";
import type { RadioQueueAction } from "../lib/radioQueueViewModel";

interface UseScopeKeyboardShortcutsOptions {
  onCloseActivePanel: () => void;
  onFocusControlField: (field: ScopeKeyboardControlField) => void;
  onFocusAtcCommand: () => void;
  onSelectedRadioQueueAction: (action: RadioQueueAction) => void;
  onToggleChrome: () => void;
  onToggleControlPanel: () => void;
  onTogglePause: () => void;
  onToggleScenarioPanel: () => void;
  onToggleTrafficPanel: () => void;
  onToggleWindPanel: () => void;
}

export function useScopeKeyboardShortcuts({
  onCloseActivePanel,
  onFocusControlField,
  onFocusAtcCommand,
  onSelectedRadioQueueAction,
  onToggleChrome,
  onToggleControlPanel,
  onTogglePause,
  onToggleScenarioPanel,
  onToggleTrafficPanel,
  onToggleWindPanel
}: UseScopeKeyboardShortcutsOptions) {
  useEffect(() => {
    function handleScopeShortcut(event: KeyboardEvent) {
      const action = scopeKeyboardShortcutAction(
        event,
        scopeKeyboardShortcutTargetKindForElement(event.target)
      );

      if (!action) {
        return;
      }

      event.preventDefault();

      if (action === "focus_atc") {
        onFocusAtcCommand();
        return;
      }

      if (action === "focus_control_heading") {
        onFocusControlField("heading");
        return;
      }

      if (action === "focus_control_speed") {
        onFocusControlField("speed");
        return;
      }

      if (action === "focus_control_altitude") {
        onFocusControlField("altitude");
        return;
      }

      if (action === "focus_control_vertical_rate") {
        onFocusControlField("verticalRate");
        return;
      }

      if (action === "toggle_pause") {
        onTogglePause();
        return;
      }

      if (action === "toggle_chrome") {
        onToggleChrome();
        return;
      }

      if (action === "toggle_control_panel") {
        onToggleControlPanel();
        return;
      }

      if (action === "toggle_traffic_panel") {
        onToggleTrafficPanel();
        return;
      }

      if (action === "toggle_scenario_panel") {
        onToggleScenarioPanel();
        return;
      }

      if (action === "toggle_wind_panel") {
        onToggleWindPanel();
        return;
      }

      if (action === "selected_radio_go_ahead") {
        onSelectedRadioQueueAction("GO_AHEAD");
        return;
      }

      if (action === "selected_radio_say_again") {
        onSelectedRadioQueueAction("SAY_AGAIN");
        return;
      }

      if (action === "selected_radio_standby") {
        onSelectedRadioQueueAction("STANDBY");
        return;
      }

      onCloseActivePanel();
    }

    window.addEventListener("keydown", handleScopeShortcut);

    return () => {
      window.removeEventListener("keydown", handleScopeShortcut);
    };
  }, [
    onCloseActivePanel,
    onFocusControlField,
    onFocusAtcCommand,
    onSelectedRadioQueueAction,
    onToggleChrome,
    onToggleControlPanel,
    onTogglePause,
    onToggleScenarioPanel,
    onToggleTrafficPanel,
    onToggleWindPanel
  ]);
}
