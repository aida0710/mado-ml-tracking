/**
 * The dialog's classes. Below --bp-sm a dialog fills the screen, or with `fullScreenOnNarrow` off
 * (short confirmations) it becomes a sheet from the bottom edge.
 */
export function dialogClassName({
  wide,
  fullScreenOnNarrow,
  className,
}: {
  wide: boolean;
  fullScreenOnNarrow: boolean;
  className: string;
}) {
  return [
    'dialog',
    wide && 'wide',
    fullScreenOnNarrow ? 'fullscreen-on-narrow' : 'sheet-on-narrow',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}
