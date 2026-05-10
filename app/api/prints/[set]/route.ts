import { NextResponse } from "next/server";

import { getMtgDataRoot } from "@/lib/mtg/data-root";
import { listPrintSetFiles, readPrintsForSet } from "@/lib/mtg/prints-files";
import { handleRouteError } from "@/lib/http/handle-error";

type Ctx = { params: Promise<{ set: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const root = getMtgDataRoot();
    const { set } = await ctx.params;
    const code = set.toLowerCase();
    const sets = await listPrintSetFiles(root);
    if (!sets.includes(code)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const file = await readPrintsForSet(root, code);
    return NextResponse.json(file);
  } catch (e) {
    return handleRouteError(e);
  }
}
