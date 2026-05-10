import type { PrintRow } from "./schemas";

function cmpCollector(a: string, b: string): number {
  const na = Number.parseInt(a, 10);
  const nb = Number.parseInt(b, 10);
  if (
    !Number.isNaN(na) &&
    !Number.isNaN(nb) &&
    String(na) === a.trim() &&
    String(nb) === b.trim()
  ) {
    return na - nb;
  }
  return a.localeCompare(b, undefined, { numeric: true });
}

export function sortPrintRows(prints: PrintRow[]): PrintRow[] {
  return [...prints].sort((x, y) => {
    const c = cmpCollector(x.collector_number, y.collector_number);
    if (c !== 0) return c;
    return x.id.localeCompare(y.id);
  });
}
