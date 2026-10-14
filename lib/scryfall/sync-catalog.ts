import { access, readFile, writeFile } from "fs/promises";

import {
  configureLanesFromDataRoot,
  scryfallAssetGet,
  scryfallGet,
} from "./client";
import { slimCard } from "./slim-card";
import { ensureDataLayout } from "@/lib/mtg/ensure-layout";
import { loadAllPrintRows } from "@/lib/mtg/prints-files";
import {
  catalogAssetFetchedAtPath,
  catalogCardPath,
  catalogCardSymbolPath,
  catalogSetIconPath,
  catalogSetPath,
  catalogSymbologyPath,
  syncStatePath,
} from "@/lib/mtg/paths";
import { buildScanIndex } from "@/lib/scan/build-index";
import { invalidateScanIndexCache } from "@/lib/scan/match";

export type SyncProgress = (message: string) => void;

/** Written into catalog JSON files; used to skip refetches within `STALE_AFTER_MS`. */
export const CATALOG_FETCHED_AT_KEY = "_catalogFetchedAt";

const STALE_AFTER_MS = 12 * 60 * 60 * 1000;

type AssetFetchedAtFile = {
  setIcons?: Record<string, string>;
  cardSymbols?: Record<string, string>;
};

export type RunSyncOptions = {
  onProgress?: SyncProgress;
  /** Refresh every asset regardless of age (CLI `--full`, API `?full=1`). */
  full?: boolean;
  /** Only refresh catalog card JSON; skip sets, set icons, symbology (CLI `--cards-only`, API `?cards_only=1`). */
  cardsOnly?: boolean;
};

export type SyncRunState = {
  lastSyncAt: string;
  full: boolean;
  cardsOnly: boolean;
  cardTargets: number;
  cardsFetched: number;
  cardsSkipped: number;
  setsFetched: number;
  setsSkipped: number;
  iconsFetched: number;
  iconsSkipped: number;
  symbologyJsonFetched: boolean;
  cardSymbolsFetched: number;
  cardSymbolsSkipped: number;
  scanIndexEntries: number;
  scanImagesFetched: number;
  scanImagesSkipped: number;
  scanIndexPruned: number;
  errors: string[];
};

function normalizeRunSyncOptions(
  options?: SyncProgress | RunSyncOptions,
): RunSyncOptions {
  if (typeof options === "function") return { onProgress: options };
  return options ?? {};
}

function isStale(iso: string | undefined): boolean {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return true;
  return Date.now() - t >= STALE_AFTER_MS;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFetchedAt(path: string): Promise<string | undefined> {
  try {
    const raw = await readFile(path, "utf-8");
    const o = JSON.parse(raw) as Record<string, unknown>;
    const v = o[CATALOG_FETCHED_AT_KEY];
    return typeof v === "string" ? v : undefined;
  } catch {
    return undefined;
  }
}

async function jsonFileNeedsFetch(path: string, full: boolean): Promise<boolean> {
  if (full) return true;
  const iso = await readJsonFetchedAt(path);
  return isStale(iso);
}

/** Set catalog JSON: refetch only when missing or `--full` (still discover new codes via `/sets` index). */
async function catalogSetJsonNeedsFetch(path: string, full: boolean): Promise<boolean> {
  if (full) return true;
  return !(await fileExists(path));
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await scryfallGet(url);
  if (!res.ok) {
    throw new Error(`Scryfall ${res.status}: ${url}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

/** Every set code from Scryfall `/sets` (paginated); partial list if a page errors mid-way. */
async function fetchAllScryfallSetCodes(errors: string[]): Promise<string[]> {
  const codes = new Set<string>();
  let url: string | null = "https://api.scryfall.com/sets";
  while (url) {
    try {
      const res = await scryfallGet(url);
      if (!res.ok) {
        errors.push(`sets list ${res.status}: ${url}`);
        break;
      }
      const page = (await res.json()) as {
        data?: { code?: string }[];
        next_page?: string | null;
      };
      const rows = Array.isArray(page.data) ? page.data : [];
      for (const row of rows) {
        if (typeof row.code === "string" && row.code.length > 0) {
          codes.add(row.code.toLowerCase());
        }
      }
      url =
        typeof page.next_page === "string" && page.next_page.length > 0
          ? page.next_page
          : null;
    } catch (e) {
      errors.push(`sets list: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
  }
  return [...codes].sort();
}

async function setCodesFromCollectionCards(
  root: string,
  cardIds: string[],
): Promise<string[]> {
  const setCodes = new Set<string>();
  for (const id of cardIds) {
    try {
      const raw = await readFile(catalogCardPath(root, id), "utf-8");
      const c = JSON.parse(raw) as { set?: string };
      if (c.set) setCodes.add(String(c.set).toLowerCase());
    } catch {
      /* skip */
    }
  }
  return [...setCodes].sort();
}

async function downloadSvg(url: string): Promise<string> {
  const res = await scryfallAssetGet(url);
  if (!res.ok) throw new Error(`SVG ${res.status}: ${url}`);
  return res.text();
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await fn(items[idx]!);
    }
  });
  await Promise.all(workers);
}

/** Basename of SVG on Scryfall CDN, e.g. `WU.svg` from `https://svgs.scryfall.io/card-symbols/WU.svg`. */
function cardSymbolSvgBasename(svgUri: string): string {
  let pathname: string;
  try {
    pathname = new URL(svgUri).pathname;
  } catch {
    throw new Error(`Bad svg_uri: ${svgUri}`);
  }
  const seg = pathname.split("/").pop();
  if (!seg?.toLowerCase().endsWith(".svg")) {
    throw new Error(`Expected *.svg in svg_uri: ${svgUri}`);
  }
  return seg;
}

function symbolJobsFromSymbologyPayload(
  symbology: Record<string, unknown>,
  errors: string[],
): { file: string; uri: string }[] {
  const symData = Array.isArray(symbology.data)
    ? (symbology.data as { svg_uri?: string }[])
    : [];
  const byBasename = new Map<string, string>();
  for (const row of symData) {
    const uri = row.svg_uri;
    if (typeof uri !== "string" || !uri.trim()) continue;
    try {
      const base = cardSymbolSvgBasename(uri.trim());
      if (!byBasename.has(base)) byBasename.set(base, uri.trim());
    } catch (e) {
      errors.push(`symbology uri: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return [...byBasename.entries()].map(([file, uri]) => ({ file, uri }));
}

async function loadSymbologyPayloadFromDisk(
  root: string,
): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(catalogSymbologyPath(root), "utf-8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function loadAssetFetchedAt(root: string): Promise<AssetFetchedAtFile> {
  try {
    const raw = await readFile(catalogAssetFetchedAtPath(root), "utf-8");
    return JSON.parse(raw) as AssetFetchedAtFile;
  } catch {
    return {};
  }
}

async function saveAssetFetchedAt(root: string, data: AssetFetchedAtFile) {
  await writeFile(
    catalogAssetFetchedAtPath(root),
    `${JSON.stringify(data, null, 2)}\n`,
    "utf-8",
  );
}

export async function runSync(
  root: string,
  options?: SyncProgress | RunSyncOptions,
): Promise<SyncRunState> {
  const { onProgress, full = false, cardsOnly = false } = normalizeRunSyncOptions(options);
  const log = onProgress ?? (() => {});
  await ensureDataLayout(root);
  await configureLanesFromDataRoot(root);

  const assetMeta = cardsOnly ? {} : await loadAssetFetchedAt(root);

  const rows = await loadAllPrintRows(root);
  const ids = [...new Set(rows.map((r) => r.row.id))];
  log(
    `Sync ${ids.length} cards (${full ? "full" : "incremental"}${cardsOnly ? ", cards-only" : ""}; skip card files fetched within 12h unless full)…`,
  );

  const errors: string[] = [];
  let cardsFetched = 0;
  let cardsSkipped = 0;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const cpath = catalogCardPath(root, id);
    try {
      if (!(await jsonFileNeedsFetch(cpath, full))) {
        cardsSkipped++;
        if (i % 25 === 0) {
          log(`Cards ${i + 1}/${ids.length} (${cardsSkipped} skipped)`);
        }
        continue;
      }
      const url = `https://api.scryfall.com/cards/${encodeURIComponent(id)}`;
      const card = await fetchJson(url);
      const slim = slimCard(card);
      const fetchedAt = new Date().toISOString();
      await writeFile(
        cpath,
        `${JSON.stringify({ ...slim, [CATALOG_FETCHED_AT_KEY]: fetchedAt }, null, 2)}\n`,
        "utf-8",
      );
      cardsFetched++;
      if (i % 25 === 0) log(`Cards ${i + 1}/${ids.length}`);
    } catch (e) {
      errors.push(`${id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  let setsFetched = 0;
  let setsSkipped = 0;
  let iconsFetched = 0;
  let iconsSkipped = 0;
  let symbologyJsonFetched = false;
  let cardSymbolsFetched = 0;
  let cardSymbolsSkipped = 0;

  if (cardsOnly) {
    log("Skipping sets, set icons, symbology, and card-symbol SVGs (cards-only).");
  } else {
    log("Scryfall sets index…");
    let setList = await fetchAllScryfallSetCodes(errors);
    if (setList.length === 0) {
      log("Set index empty; falling back to sets from collection card catalog…");
      setList = await setCodesFromCollectionCards(root, ids);
    }
    log(`Sets ${setList.length}…`);

    const setsRefreshedThisRun = new Set<string>();
    for (const code of setList) {
      const spath = catalogSetPath(root, code);
      try {
        if (!(await catalogSetJsonNeedsFetch(spath, full))) {
          setsSkipped++;
          continue;
        }
        const url = `https://api.scryfall.com/sets/${encodeURIComponent(code)}`;
        const setObj = await fetchJson(url);
        const fetchedAt = new Date().toISOString();
        await writeFile(
          spath,
          `${JSON.stringify({ ...setObj, [CATALOG_FETCHED_AT_KEY]: fetchedAt }, null, 2)}\n`,
          "utf-8",
        );
        setsRefreshedThisRun.add(code.toLowerCase());
        setsFetched++;
      } catch (e) {
        errors.push(`set ${code}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    log(`Icons (${setList.length})…`);
    await runPool(setList, 3, async (code) => {
      const codeLower = code.toLowerCase();
      try {
        const raw = await readFile(catalogSetPath(root, code), "utf-8");
        const setObj = JSON.parse(raw) as { icon_svg_uri?: string };
        const iconUri = setObj.icon_svg_uri;
        if (typeof iconUri !== "string" || !iconUri.length) return;

        const iconPath = catalogSetIconPath(root, code);
        const needsIcon =
          full ||
          setsRefreshedThisRun.has(codeLower) ||
          !(await fileExists(iconPath));

        if (!needsIcon) {
          iconsSkipped++;
          return;
        }

        const svg = await downloadSvg(iconUri);
        await writeFile(iconPath, svg, "utf-8");
        if (!assetMeta.setIcons) assetMeta.setIcons = {};
        assetMeta.setIcons[codeLower] = new Date().toISOString();
        iconsFetched++;
      } catch (e) {
        errors.push(`icon ${code}: ${e instanceof Error ? e.message : String(e)}`);
      }
    });

    const symPath = catalogSymbologyPath(root);
    const symJsonNeeds = await jsonFileNeedsFetch(symPath, full);
    symbologyJsonFetched = false;
    let symPayload: Record<string, unknown> | null = null;

    if (symJsonNeeds) {
      log("Card symbols (symbology API)…");
      try {
        symPayload = await fetchJson("https://api.scryfall.com/symbology");
        const fetchedAt = new Date().toISOString();
        await writeFile(
          symPath,
          `${JSON.stringify({ ...symPayload, [CATALOG_FETCHED_AT_KEY]: fetchedAt }, null, 2)}\n`,
          "utf-8",
        );
        symbologyJsonFetched = true;
      } catch (e) {
        errors.push(`symbology: ${e instanceof Error ? e.message : String(e)}`);
        symPayload = await loadSymbologyPayloadFromDisk(root);
      }
    } else {
      log("Symbology JSON skipped (fresh); checking symbol SVGs…");
      symPayload = await loadSymbologyPayloadFromDisk(root);
    }

    if (symPayload) {
      const jobs = symbolJobsFromSymbologyPayload(symPayload, errors);
      await runPool(jobs, 4, async ({ file, uri }) => {
        try {
          const symPathFile = catalogCardSymbolPath(root, file);
          const needsDl =
            full ||
            !(await fileExists(symPathFile)) ||
            isStale(assetMeta.cardSymbols?.[file]);

          if (!needsDl) {
            cardSymbolsSkipped++;
            return;
          }
          const svg = await downloadSvg(uri);
          await writeFile(symPathFile, svg, "utf-8");
          if (!assetMeta.cardSymbols) assetMeta.cardSymbols = {};
          assetMeta.cardSymbols[file] = new Date().toISOString();
          cardSymbolsFetched++;
        } catch (e) {
          errors.push(`symbol ${file}: ${e instanceof Error ? e.message : String(e)}`);
        }
      });
      log(`Card symbols ${cardSymbolsFetched} fetched, ${cardSymbolsSkipped} skipped (${jobs.length} total)`);
    }

    await saveAssetFetchedAt(root, assetMeta);
  }

  log("Scan index…");
  const scanIndex = await buildScanIndex(root, { full, onProgress: log });
  invalidateScanIndexCache();

  const state: SyncRunState = {
    lastSyncAt: new Date().toISOString(),
    full,
    cardsOnly,
    cardTargets: ids.length,
    cardsFetched,
    cardsSkipped,
    setsFetched,
    setsSkipped,
    iconsFetched,
    iconsSkipped,
    symbologyJsonFetched,
    cardSymbolsFetched,
    cardSymbolsSkipped,
    scanIndexEntries: scanIndex.hashesBuilt,
    scanImagesFetched: scanIndex.imagesFetched,
    scanImagesSkipped: scanIndex.imagesSkipped,
    scanIndexPruned: scanIndex.prunedImages,
    errors: [...errors, ...scanIndex.errors],
  };

  await writeFile(syncStatePath(root), `${JSON.stringify(state, null, 2)}\n`, "utf-8");
  log(
    cardsOnly
      ? `Done (cards-only). Cards ${cardsFetched} fetched / ${cardsSkipped} skipped, scan index ${scanIndex.hashesBuilt} entries, errors ${state.errors.length}`
      : `Done. Cards ${cardsFetched} fetched / ${cardsSkipped} skipped, sets ${setsFetched}/${setsSkipped}, icons ${iconsFetched}/${iconsSkipped}, symbology JSON ${symbologyJsonFetched ? "refreshed" : "skipped"}, symbols ${cardSymbolsFetched}/${cardSymbolsSkipped}, scan index ${scanIndex.hashesBuilt} entries, errors ${state.errors.length}`,
  );
  return state;
}
