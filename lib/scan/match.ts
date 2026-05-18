import { readFile, stat } from "fs/promises";

import { readOrCreateConfig } from "@/lib/mtg/config-file";
import { catalogCardPath, catalogScanIndexHashesPath, catalogScanIndexManifestPath } from "@/lib/mtg/paths";
import { catalogCardSchema, type PrintRow } from "@/lib/mtg/schemas";
import { loadAllPrintRows } from "@/lib/mtg/prints-files";
import { isWishlistRow } from "@/lib/mtg/totals";
import { SCAN_HASH_BITS, SCAN_HASH_BYTE_SIZE } from "@/lib/scan/constants";
import { resolveScanConfig } from "@/lib/scan/config";
import {
  computeDHash,
  confidenceFromDistance,
  hammingDistance,
  hashFromBuffer,
  type ScanHash,
} from "@/lib/scan/dhash";
import { pickThumbnailUrl } from "@/lib/scan/image-url";
import type { ScanIndexManifest, ScanMatchResult } from "@/lib/scan/types";

type LoadedIndex = {
  manifest: ScanIndexManifest;
  hashes: ScanHash[];
  mtimeMs: number;
};

let cached: LoadedIndex | null = null;

async function loadIndex(root: string): Promise<LoadedIndex | null> {
  const manifestPath = catalogScanIndexManifestPath(root);
  try {
    const st = await stat(manifestPath);
    if (cached && cached.mtimeMs === st.mtimeMs) return cached;

    const manifestRaw = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(manifestRaw) as ScanIndexManifest;
    if (manifest.hashSizeBits !== SCAN_HASH_BITS) {
      cached = null;
      return null;
    }
    const hashBuf = await readFile(catalogScanIndexHashesPath(root));
    const expectedBytes = manifest.entryCount * SCAN_HASH_BYTE_SIZE;
    if (hashBuf.length < expectedBytes) {
      cached = null;
      return null;
    }
    const hashes: ScanHash[] = [];
    for (let i = 0; i < manifest.entryCount; i++) {
      hashes.push(hashFromBuffer(hashBuf, i * SCAN_HASH_BYTE_SIZE));
    }

    cached = { manifest, hashes, mtimeMs: st.mtimeMs };
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export function invalidateScanIndexCache(): void {
  cached = null;
}

export async function matchScanImage(
  root: string,
  imageBuffer: Buffer,
): Promise<ScanMatchResult[]> {
  const index = await loadIndex(root);
  if (!index || index.manifest.entryCount === 0) return [];

  const cfg = resolveScanConfig(await readOrCreateConfig(root));
  const queryHash = await computeDHash(imageBuffer);

  const scored: { idx: number; distance: number }[] = [];
  for (let i = 0; i < index.hashes.length; i++) {
    const distance = hammingDistance(queryHash, index.hashes[i]!);
    if (distance <= cfg.scanMatchMaxHamming) {
      scored.push({ idx: i, distance });
    }
  }

  scored.sort((a, b) => a.distance - b.distance);
  const top = scored.slice(0, cfg.scanMatchMaxResults);

  if (top.length === 0) return [];

  const allPrints = await loadAllPrintRows(root);
  const printById = new Map<string, { row: PrintRow; set: string }>();
  for (const { set, row } of allPrints) {
    printById.set(row.id, { row, set });
  }

  const results: ScanMatchResult[] = [];

  for (const { idx, distance } of top) {
    const cardId = index.manifest.cardIds[idx];
    if (!cardId) continue;

    let card;
    try {
      const raw = await readFile(catalogCardPath(root, cardId), "utf-8");
      card = catalogCardSchema.parse(JSON.parse(raw) as unknown);
    } catch {
      continue;
    }

    const printEntry = printById.get(cardId);
    const row = printEntry?.row;
    const wishlist = row ? isWishlistRow(row) : false;
    const owned = row ? !wishlist : false;

    results.push({
      id: cardId,
      name: card.name,
      set: card.set,
      collector_number: card.collector_number,
      distance,
      confidence: confidenceFromDistance(distance),
      imageUrl: pickThumbnailUrl(card),
      owned,
      wishlist,
      print: row,
    });
  }

  return results;
}
