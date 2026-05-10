import { readFile } from "fs/promises";

import { catalogCardPath } from "@/lib/mtg/paths";
import { loadAllPrintRows } from "@/lib/mtg/prints-files";
import {
  catalogCardSchema,
  type CatalogCard,
  type PrintRow,
} from "@/lib/mtg/schemas";
import { isWishlistRow, rowTotals } from "@/lib/mtg/totals";

export type CollectionReportCardLine = {
  id: string;
  name: string;
  collector_number: string;
  qtyNonfoil: number;
  qtyFoil: number;
  unitNonfoilUsd: number | null;
  unitNonfoilEur: number | null;
  unitFoilUsd: number | null;
  unitFoilEur: number | null;
  subtotalNonfoilUsd: number;
  subtotalNonfoilEur: number;
  subtotalFoilUsd: number;
  subtotalFoilEur: number;
  lineTotalUsd: number;
  lineTotalEur: number;
  missingCatalog: boolean;
  missingNonfoilPriceUsd: boolean;
  missingNonfoilPriceEur: boolean;
  missingFoilPriceUsd: boolean;
  missingFoilPriceEur: boolean;
};

export type CollectionReportSetBlock = {
  setCode: string;
  setName: string | null;
  totalNonfoilUsd: number;
  totalNonfoilEur: number;
  totalFoilUsd: number;
  totalFoilEur: number;
  totalUsd: number;
  totalEur: number;
  cards: CollectionReportCardLine[];
};

export type CollectionReport = {
  generatedAt: string;
  grandTotalNonfoilUsd: number;
  grandTotalNonfoilEur: number;
  grandTotalFoilUsd: number;
  grandTotalFoilEur: number;
  grandTotalUsd: number;
  grandTotalEur: number;
  ownedPrintCount: number;
  cardsMissingCatalog: number;
  cardsWithMissingNonfoilPriceUsd: number;
  cardsWithMissingNonfoilPriceEur: number;
  cardsWithMissingFoilPriceUsd: number;
  cardsWithMissingFoilPriceEur: number;
  sets: CollectionReportSetBlock[];
};

function parsePriceString(v: string | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function pickNonfoilUsd(prices: CatalogCard["prices"]): number | null {
  if (!prices) return null;
  return parsePriceString(prices.usd);
}

function pickNonfoilEur(prices: CatalogCard["prices"]): number | null {
  if (!prices) return null;
  return parsePriceString(prices.eur);
}

function pickFoilUsd(prices: CatalogCard["prices"]): number | null {
  if (!prices) return null;
  return (
    parsePriceString(prices.usd_foil) ??
    parsePriceString(prices.usd_etched) ??
    null
  );
}

function pickFoilEur(prices: CatalogCard["prices"]): number | null {
  if (!prices) return null;
  return (
    parsePriceString(prices.eur_foil) ??
    parsePriceString(prices.eur_etched) ??
    null
  );
}

function loosePricesFromCatalogJson(data: unknown): CatalogCard["prices"] | undefined {
  const o =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : undefined;
  const p = o?.prices;
  if (!p || typeof p !== "object" || Array.isArray(p)) return undefined;
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(p)) {
    if (typeof v === "string" || v === null) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

async function readCatalogPricing(
  root: string,
  id: string,
): Promise<{
  missingFile: boolean;
  prices: CatalogCard["prices"] | undefined;
  setName: string | null;
}> {
  try {
    const raw = await readFile(catalogCardPath(root, id), "utf-8");
    const data = JSON.parse(raw) as unknown;
    const parsed = catalogCardSchema.safeParse(data);
    if (parsed.success) {
      return {
        missingFile: false,
        prices: parsed.data.prices,
        setName: parsed.data.set_name ?? null,
      };
    }
    const o =
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : {};
    return {
      missingFile: false,
      prices: loosePricesFromCatalogJson(data),
      setName: typeof o.set_name === "string" ? o.set_name : null,
    };
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") {
      return { missingFile: true, prices: undefined, setName: null };
    }
    throw e;
  }
}

async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      out[idx] = await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
  return out;
}

function lineForRow(
  row: PrintRow,
  prices: CatalogCard["prices"] | undefined,
  missingCatalog: boolean,
): CollectionReportCardLine {
  const t = rowTotals(row);
  const qtyNonfoil = t.nonfoil;
  const qtyFoil = t.foil;

  const unitNonfoilUsd = missingCatalog ? null : pickNonfoilUsd(prices);
  const unitNonfoilEur = missingCatalog ? null : pickNonfoilEur(prices);
  const unitFoilUsd = missingCatalog ? null : pickFoilUsd(prices);
  const unitFoilEur = missingCatalog ? null : pickFoilEur(prices);

  const subtotalNonfoilUsd =
    qtyNonfoil > 0 && unitNonfoilUsd != null ? qtyNonfoil * unitNonfoilUsd : 0;
  const subtotalNonfoilEur =
    qtyNonfoil > 0 && unitNonfoilEur != null ? qtyNonfoil * unitNonfoilEur : 0;
  const subtotalFoilUsd = qtyFoil > 0 && unitFoilUsd != null ? qtyFoil * unitFoilUsd : 0;
  const subtotalFoilEur = qtyFoil > 0 && unitFoilEur != null ? qtyFoil * unitFoilEur : 0;

  return {
    id: row.id,
    name: row.name,
    collector_number: row.collector_number,
    qtyNonfoil,
    qtyFoil,
    unitNonfoilUsd,
    unitNonfoilEur,
    unitFoilUsd,
    unitFoilEur,
    subtotalNonfoilUsd,
    subtotalNonfoilEur,
    subtotalFoilUsd,
    subtotalFoilEur,
    lineTotalUsd: subtotalNonfoilUsd + subtotalFoilUsd,
    lineTotalEur: subtotalNonfoilEur + subtotalFoilEur,
    missingCatalog,
    missingNonfoilPriceUsd: qtyNonfoil > 0 && unitNonfoilUsd == null,
    missingNonfoilPriceEur: qtyNonfoil > 0 && unitNonfoilEur == null,
    missingFoilPriceUsd: qtyFoil > 0 && unitFoilUsd == null,
    missingFoilPriceEur: qtyFoil > 0 && unitFoilEur == null,
  };
}

export async function buildCollectionReport(root: string): Promise<CollectionReport> {
  const all = await loadAllPrintRows(root);
  const owned = all.filter(({ row }) => !isWishlistRow(row));

  type RowIn = { setCode: string; row: PrintRow };
  const inputs: RowIn[] = owned.map(({ set, row }) => ({
    setCode: set.toLowerCase(),
    row,
  }));

  const lines = await mapPool(inputs, 24, async ({ setCode, row }) => {
    const { missingFile, prices, setName } = await readCatalogPricing(root, row.id);
    return {
      setCode,
      line: lineForRow(row, prices, missingFile),
      setName,
    };
  });

  const bySet = new Map<
    string,
    { setName: string | null; cards: CollectionReportCardLine[] }
  >();

  for (const { setCode, line, setName } of lines) {
    let g = bySet.get(setCode);
    if (!g) {
      g = { setName: null, cards: [] };
      bySet.set(setCode, g);
    }
    g.cards.push(line);
    if (!g.setName && setName) g.setName = setName;
  }

  const sets: CollectionReportSetBlock[] = [...bySet.entries()].map(([setCode, g]) => {
    const cards = [...g.cards].sort((a, b) => b.lineTotalUsd - a.lineTotalUsd);
    let totalNonfoilUsd = 0;
    let totalNonfoilEur = 0;
    let totalFoilUsd = 0;
    let totalFoilEur = 0;
    for (const c of cards) {
      totalNonfoilUsd += c.subtotalNonfoilUsd;
      totalNonfoilEur += c.subtotalNonfoilEur;
      totalFoilUsd += c.subtotalFoilUsd;
      totalFoilEur += c.subtotalFoilEur;
    }
    return {
      setCode,
      setName: g.setName,
      totalNonfoilUsd,
      totalNonfoilEur,
      totalFoilUsd,
      totalFoilEur,
      totalUsd: totalNonfoilUsd + totalFoilUsd,
      totalEur: totalNonfoilEur + totalFoilEur,
      cards,
    };
  });

  sets.sort((a, b) => b.totalUsd - a.totalUsd);

  let grandTotalNonfoilUsd = 0;
  let grandTotalNonfoilEur = 0;
  let grandTotalFoilUsd = 0;
  let grandTotalFoilEur = 0;
  let cardsMissingCatalog = 0;
  let cardsWithMissingNonfoilPriceUsd = 0;
  let cardsWithMissingNonfoilPriceEur = 0;
  let cardsWithMissingFoilPriceUsd = 0;
  let cardsWithMissingFoilPriceEur = 0;

  for (const s of sets) {
    grandTotalNonfoilUsd += s.totalNonfoilUsd;
    grandTotalNonfoilEur += s.totalNonfoilEur;
    grandTotalFoilUsd += s.totalFoilUsd;
    grandTotalFoilEur += s.totalFoilEur;
    for (const c of s.cards) {
      if (c.missingCatalog) cardsMissingCatalog++;
      if (c.missingNonfoilPriceUsd) cardsWithMissingNonfoilPriceUsd++;
      if (c.missingNonfoilPriceEur) cardsWithMissingNonfoilPriceEur++;
      if (c.missingFoilPriceUsd) cardsWithMissingFoilPriceUsd++;
      if (c.missingFoilPriceEur) cardsWithMissingFoilPriceEur++;
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    grandTotalNonfoilUsd,
    grandTotalNonfoilEur,
    grandTotalFoilUsd,
    grandTotalFoilEur,
    grandTotalUsd: grandTotalNonfoilUsd + grandTotalFoilUsd,
    grandTotalEur: grandTotalNonfoilEur + grandTotalFoilEur,
    ownedPrintCount: owned.length,
    cardsMissingCatalog,
    cardsWithMissingNonfoilPriceUsd,
    cardsWithMissingNonfoilPriceEur,
    cardsWithMissingFoilPriceUsd,
    cardsWithMissingFoilPriceEur,
    sets,
  };
}
