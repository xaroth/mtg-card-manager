import { NextResponse } from "next/server";

import { getMtgDataRoot } from "@/lib/mtg/data-root";
import { handleRouteError } from "@/lib/http/handle-error";
import { isScanDebugEnabled, saveScanDebugImage } from "@/lib/scan/debug";
import { matchScanImage } from "@/lib/scan/match";

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("image");
    if (!(file instanceof Blob)) {
      return NextResponse.json({ error: "Missing image field" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Image too large (max 2MB)" }, { status: 413 });
    }
    if (buffer.length === 0) {
      return NextResponse.json({ error: "Empty image" }, { status: 400 });
    }

    if (isScanDebugEnabled()) {
      await saveScanDebugImage(buffer);
    }

    const root = getMtgDataRoot();
    const matches = await matchScanImage(root, buffer);
    return NextResponse.json({ matches });
  } catch (e) {
    return handleRouteError(e);
  }
}
