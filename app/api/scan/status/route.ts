import { NextResponse } from "next/server";

import { getMtgDataRoot } from "@/lib/mtg/data-root";
import { handleRouteError } from "@/lib/http/handle-error";
import { scanIndexExists } from "@/lib/scan/build-index";
import { readFile } from "fs/promises";
import { catalogScanIndexManifestPath } from "@/lib/mtg/paths";
import type { ScanIndexManifest } from "@/lib/scan/types";

export async function GET() {
  try {
    const root = getMtgDataRoot();
    const ready = await scanIndexExists(root);
    if (!ready) {
      return NextResponse.json({ ready: false, entryCount: 0 });
    }
    try {
      const raw = await readFile(catalogScanIndexManifestPath(root), "utf-8");
      const manifest = JSON.parse(raw) as ScanIndexManifest;
      return NextResponse.json({
        ready: true,
        entryCount: manifest.entryCount,
        builtAt: manifest.builtAt,
        imageKind: manifest.imageKind,
      });
    } catch {
      return NextResponse.json({ ready: false, entryCount: 0 });
    }
  } catch (e) {
    return handleRouteError(e);
  }
}
