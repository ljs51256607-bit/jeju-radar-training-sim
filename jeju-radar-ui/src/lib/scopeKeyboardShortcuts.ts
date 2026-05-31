export type ScopeKeyboardShortcutAction =
  | "close_active_panel"
  | "focus_control_altitude"
  | "focus_control_heading"
  | "focus_control_speed"
  | "focus_control_vertical_rate"
  | "focus_atc"
  | "selected_radio_go_ahead"
  | "selected_radio_say_again"
  | "selected_radio_standby"
  | "toggle_chrome"
  | "toggle_control_panel"
  | "toggle_pause"
  | "toggle_scenario_panel"
  | "toggle_traffic_panel"
  | "toggle_wind_panel";

export type ScopeKeyboardShortcutTargetKind = "interactive" | "scope" | "typing";
export type ScopeKeyboardControlField = "altitude" | "heading" | "speed" | "verticalRate";

interface ScopeKeyboardShortcutEvent {
  altKey?: boolean;
  code?: string;
  ctrlKey?: boolean;
  key: string;
  metaKey?: boolean;
  repeat?: boolean;
}

interface ScopeKeyboardShortcutTargetFlags {
  isInteractive: boolean;
  isTyping: boolean;
}

export function scopeKeyboardShortcutAction(
  event: ScopeKeyboardShortcutEvent,
  targetKind: ScopeKeyboardShortcutTargetKind
): ScopeKeyboardShortcutAction | null {
  if (
    event.repeat ||
    targetKind !== "scope" ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return null;
  }

  if (event.key === " " || event.code === "Space") {
    return "toggle_pause";
  }

  const key = event.key.toLowerCase();

  if (key === "/") {
    return "focus_atc";
  }

  if (key === "c") {
    return "toggle_chrome";
  }

  if (key === "p") {
    return "toggle_control_panel";
  }

  if (key === "t") {
    return "toggle_traffic_panel";
  }

  if (key === "s") {
    return "toggle_scenario_panel";
  }

  if (key === "w") {
    return "toggle_wind_panel";
  }

  if (key === "g") {
    return "selected_radio_go_ahead";
  }

  if (key === "a") {
    return "selected_radio_say_again";
  }

  if (key === "b") {
    return "selected_radio_standby";
  }

  if (key === "escape") {
    return "close_active_panel";
  }

  if (key === "1") {
    return "focus_control_heading";
  }

  if (key === "2") {
    return "focus_control_speed";
  }

  if (key === "3") {
    return "focus_control_altitude";
  }

  if (key === "4") {
    return "focus_control_vertical_rate";
  }

  return null;
}

export function scopeKeyboardShortcutTargetKind({
  isInteractive,
  isTyping
}: ScopeKeyboardShortcutTargetFlags): ScopeKeyboardShortcutTargetKind {
  if (isTyping) {
    return "typing";
  }

  if (isInteractive) {
    return "interactive";
  }

  return "scope";
}

export function scopeKeyboardShortcutTargetKindForElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return "scope";
  }

  return scopeKeyboardShortcutTargetKind({
    isTyping:
      target.isContentEditable ||
      Boolean(target.closest('input, textarea, select, [contenteditable="true"]')),
    isInteractive: Boolean(
      target.closest(
        'button, a[href], [role="button"], .radar-text-menu, .aircraft-control-panel, .atc-command-console, .scope-command-strip'
      )
    )
  });
}
