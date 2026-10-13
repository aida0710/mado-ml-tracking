/** Long names keep both ends so items with the same prefix remain distinguishable. */
export function shortenLineageLabel(label: string, maxLength: number): string {
  if (label.length <= maxLength) return label;
  const tail = Math.floor((maxLength - 1) / 3);
  const head = maxLength - 1 - tail;
  return `${label.slice(0, head)}…${label.slice(label.length - tail)}`;
}
