export function keyboardDeleteShouldBeIgnored(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, button, a[href], [role="button"], [contenteditable="true"], .radar-text-menu, .aircraft-control-panel'
    )
  );
}
