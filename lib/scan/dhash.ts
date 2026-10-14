import sharp from "sharp";

import {
  DHASH_COLS,
  DHASH_ROW_COUNT,
  SCAN_CANONICAL_HEIGHT,
  SCAN_CANONICAL_WIDTH,
  SCAN_HASH_BITS,
  SCAN_HASH_BYTE_SIZE,
} from "@/lib/scan/constants";

/** Fixed-length perceptual hash (`SCAN_HASH_BYTE_SIZE` bytes). */
export type ScanHash = Buffer;

function popcountByte(x: number): number {
  let n = x >>> 0;
  let c = 0;
  while (n) {
    c += n & 1;
    n >>>= 1;
  }
  return c;
}

export function hammingDistance(a: ScanHash, b: ScanHash): number {
  let count = 0;
  for (let i = 0; i < SCAN_HASH_BYTE_SIZE; i++) {
    count += popcountByte((a[i]! ^ b[i]!));
  }
  return count;
}

export function confidenceFromDistance(distance: number): number {
  return Math.max(0, Math.min(1, 1 - distance / SCAN_HASH_BITS));
}

/** Resize to canonical card dimensions (JPEG) for storage / client preview. */
export async function normalizeScanImage(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .resize(SCAN_CANONICAL_WIDTH, SCAN_CANONICAL_HEIGHT, { fit: "fill" })
    .jpeg({ quality: 85 })
    .toBuffer();
}

/** Difference hash on grayscale `DHASH_COLS`×`DHASH_ROW_COUNT` (same pipeline for index + query). */
export async function computeDHash(buffer: Buffer): Promise<ScanHash> {
  const normalized = await sharp(buffer)
    .resize(SCAN_CANONICAL_WIDTH, SCAN_CANONICAL_HEIGHT, { fit: "fill" })
    .grayscale()
    .resize(DHASH_COLS, DHASH_ROW_COUNT, { fit: "fill" })
    .raw()
    .toBuffer();

  const out = Buffer.alloc(SCAN_HASH_BYTE_SIZE);
  let bit = 0;
  for (let y = 0; y < DHASH_ROW_COUNT; y++) {
    for (let x = 0; x < DHASH_COLS - 1; x++) {
      const left = normalized[y * DHASH_COLS + x] ?? 0;
      const right = normalized[y * DHASH_COLS + x + 1] ?? 0;
      if (left < right) {
        const byteIdx = Math.floor(bit / 8);
        const bitIdx = bit % 8;
        out[byteIdx] = (out[byteIdx]! | (1 << bitIdx)) >>> 0;
      }
      bit++;
    }
  }
  return out;
}

export function hashToBuffer(hash: ScanHash): Buffer {
  return Buffer.from(hash);
}

export function hashFromBuffer(buf: Buffer, offset = 0): ScanHash {
  return Buffer.from(buf.subarray(offset, offset + SCAN_HASH_BYTE_SIZE));
}
