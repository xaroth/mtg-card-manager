import { access, readdir, readFile, unlink, writeFile } from "fs/promises";

import { readOrCreateConfig } from "@/lib/mtg/config-file";
import { ensureDataLayout } from "@/lib/mtg/ensure-layout";
import {
  catalogCardPath,
  catalogScanImagePath,
  catalogScanImagesDir,
  catalogScanIndexHashesPath,
  catalogScanIndexManifestPath,
} from "@/lib/mtg/paths";
import { catalogCardSchema, type CatalogCard } from "@/lib/mtg/schemas";
import { configureLanesFromDataRoot, scryfallAssetGet } from "@/lib/scryfall/client";
import { getScanIndexCardIds } from "@/lib/scan/card-ids";
import { SCAN_HASH_BITS, SCAN_INDEX_VERSION } from "@/lib/scan/constants";
import { resolveScanConfig } from "@/lib/scan/config";
import { computeDHash, hashToBuffer, normalizeScanImage } from "@/lib/scan/dhash";
import { pickScanImageUrl } from "@/lib/scan/image-url";
import type { ScanIndexBuildState, ScanIndexManifest } from "@/lib/scan/types";

export type BuildScanIndexOptions = {
  full?: boolean;
  onProgress?: (message: string) => void;
};

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
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

async function ensureReferenceImage(
  root: string,
  cardId: string,
  card: CatalogCard,
  imageKind: ScanIndexManifest["imageKind"],
  full: boolean,
): Promise<Buffer | null> {
  const imagePath = catalogScanImagePath(root, cardId);
  if (!full && (await fileExists(imagePath))) {
    return readFile(imagePath);
  }

  const url = pickScanImageUrl(card, imageKind);
  if (!url) return null;

  const res = await scryfallAssetGet(url);
  if (!res.ok) {
    throw new Error(`Image ${res.status}: ${url}`);
  }
  const raw = Buffer.from(await res.arrayBuffer());
  const normalized = await normalizeScanImage(raw);
  await writeFile(imagePath, normalized);
  return normalized;
}

async function pruneOrphanScanImages(root: string, keepIds: Set<string>): Promise<number> {
  let pruned = 0;
  try {
    const names = await readdir(catalogScanImagesDir(root));
    for (const name of names) {
      if (!name.endsWith(".jpg")) continue;
      const id = name.slice(0, -4);
      if (!keepIds.has(id)) {
        await unlink(catalogScanImagePath(root, id));
        pruned++;
      }
    }
  } catch {
    /* dir may not exist yet */
  }
  return pruned;
}

export async function buildScanIndex(
  root: string,
  options?: BuildScanIndexOptions,
): Promise<ScanIndexBuildState> {
  const { full = false, onProgress } = options ?? {};
  const log = onProgress ?? (() => {});

  await ensureDataLayout(root);
  await configureLanesFromDataRoot(root);

  const cfg = resolveScanConfig(await readOrCreateConfig(root));
  const cardIds = await getScanIndexCardIds(root);
  const keepIds = new Set(cardIds);

  log(`Scan index: ${cardIds.length} collection cards (${full ? "full" : "incremental"})…`);

  const errors: string[] = [];
  let imagesFetched = 0;
  let imagesSkipped = 0;
  const hashById = new Map<string, Awaited<ReturnType<typeof computeDHash>>>();

  await runPool(cardIds, 3, async (cardId) => {
    try {
      const raw = await readFile(catalogCardPath(root, cardId), "utf-8");
      const card = catalogCardSchema.parse(JSON.parse(raw) as unknown);

      const imagePath = catalogScanImagePath(root, cardId);
      const hadImage = !full && (await fileExists(imagePath));

      const imageBuf = await ensureReferenceImage(
        root,
        cardId,
        card,
        cfg.scanIndexImageKind,
        full,
      );
      if (!imageBuf) {
        errors.push(`${cardId}: no image URL in catalog`);
        return;
      }

      if (hadImage) imagesSkipped++;
      else imagesFetched++;

      hashById.set(cardId, await computeDHash(imageBuf));
    } catch (e) {
      errors.push(`${cardId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  const indexedIds = cardIds.filter((id) => hashById.has(id));
  const hashBuf = Buffer.concat(indexedIds.map((id) => hashToBuffer(hashById.get(id)!)));

  const manifest: ScanIndexManifest = {
    version: SCAN_INDEX_VERSION,
    builtAt: new Date().toISOString(),
    imageKind: cfg.scanIndexImageKind,
    hashSizeBits: SCAN_HASH_BITS,
    entryCount: indexedIds.length,
    cardIds: indexedIds,
  };

  await writeFile(
    catalogScanIndexManifestPath(root),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf-8",
  );
  await writeFile(catalogScanIndexHashesPath(root), hashBuf);

  const prunedImages = await pruneOrphanScanImages(root, keepIds);

  log(
    `Scan index done: ${manifest.entryCount} entries, images ${imagesFetched} fetched / ${imagesSkipped} skipped, pruned ${prunedImages}, errors ${errors.length}`,
  );

  return {
    cardTargets: cardIds.length,
    imagesFetched,
    imagesSkipped,
    hashesBuilt: manifest.entryCount,
    prunedImages,
    errors,
  };
}

export async function scanIndexExists(root: string): Promise<boolean> {
  return fileExists(catalogScanIndexManifestPath(root));
}
