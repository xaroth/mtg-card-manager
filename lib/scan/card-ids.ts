import { loadAllPrintRows } from "@/lib/mtg/prints-files";

/** v1: collection prints only; extend here for broader catalog indexing later. */
export async function getScanIndexCardIds(root: string): Promise<string[]> {
  const rows = await loadAllPrintRows(root);
  return [...new Set(rows.map((r) => r.row.id))].sort();
}
