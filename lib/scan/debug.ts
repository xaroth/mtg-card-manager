import { writeFile } from "fs/promises";
import { join } from "path";

import { getMtgDataRoot } from "@/lib/mtg/data-root";

export function isScanDebugEnabled(): boolean {
  return process.env.SCAN_DEBUG?.trim().toLowerCase() === "true";
}

/** Writes `scanned-file.jpg` under MTG_DATA_DIR when SCAN_DEBUG=true. */
export async function saveScanDebugImage(buffer: Buffer): Promise<void> {
  const path = join(getMtgDataRoot(), "scanned-file.jpg");
  await writeFile(path, buffer);
}
