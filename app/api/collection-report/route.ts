import { NextResponse } from "next/server";

import { getMtgDataRoot } from "@/lib/mtg/data-root";
import { buildCollectionReport } from "@/lib/mtg/build-collection-report";
import { handleRouteError } from "@/lib/http/handle-error";

export const maxDuration = 120;

export async function GET() {
  try {
    const root = getMtgDataRoot();
    const report = await buildCollectionReport(root);
    return NextResponse.json(report);
  } catch (e) {
    return handleRouteError(e);
  }
}
