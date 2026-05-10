import type { PrintRow } from "./schemas";

export function rowTotals(row: PrintRow): { nonfoil: number; foil: number } {
  const bn = row.binders.reduce((a, s) => a + s.nonfoil, 0);
  const bf = row.binders.reduce((a, s) => a + s.foil, 0);
  return {
    nonfoil: row.storage.nonfoil + bn,
    foil: row.storage.foil + bf,
  };
}

export function isWishlistRow(row: PrintRow): boolean {
  const t = rowTotals(row);
  return t.nonfoil === 0 && t.foil === 0;
}
