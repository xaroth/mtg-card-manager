import { readFile } from "fs/promises";
import { NextResponse } from "next/server";

import { getMtgDataRoot } from "@/lib/mtg/data-root";
import { catalogCardPath } from "@/lib/mtg/paths";
import { loadAllPrintRows, upsertPrintRow } from "@/lib/mtg/prints-files";
import { readBinders } from "@/lib/mtg/binders-file";
import { printRowSchema } from "@/lib/mtg/schemas";
import { handleRouteError } from "@/lib/http/handle-error";

async function cardmarketIdMapFromCatalog(root: string, cardIds: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(cardIds)];
  const out = new Map<string, number>();
  if (!unique.length) return out;

  const concurrency = 24;
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, unique.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= unique.length) return;
      const id = unique[idx]!;
      try {
        const raw = await readFile(catalogCardPath(root, id), "utf-8");
        const j = JSON.parse(raw) as { cardmarket_id?: unknown };
        const v = j.cardmarket_id;
        if (typeof v === "number" && Number.isInteger(v) && v > 0) out.set(id, v);
      } catch {
        /* missing or invalid catalog file */
      }
    }
  });
  await Promise.all(workers);
  return out;
}

export async function GET(req: Request) {
  try {
    const root = getMtgDataRoot();
    const url = new URL(req.url);
    const setFilter = url.searchParams.get("set")?.toLowerCase();
    const binders = await readBinders(root);
    let rows = await loadAllPrintRows(root);
    if (setFilter) {
      rows = rows.filter((r) => r.set.toLowerCase() === setFilter);
    }

    const cmByCard = await cardmarketIdMapFromCatalog(
      root,
      rows.map((r) => r.row.id),
    );

    return NextResponse.json({
      binders,
      prints: rows.map(({ set, row }) => {
        const cm = cmByCard.get(row.id);
        return {
          ...row,
          set,
          ...(cm !== undefined ? { cardmarket_id: cm } : {}),
        };
      }),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const root = getMtgDataRoot();
    const row = printRowSchema.parse(await req.json());
    await upsertPrintRow(root, row);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
