import { NextResponse } from "next/server";
import { readFile } from "fs/promises";

import { getMtgDataRoot } from "@/lib/mtg/data-root";
import { catalogCardPath } from "@/lib/mtg/paths";
import { handleRouteError } from "@/lib/http/handle-error";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const root = getMtgDataRoot();
    const { id } = await ctx.params;
    try {
      const raw = await readFile(catalogCardPath(root, id), "utf-8");
      return NextResponse.json(JSON.parse(raw));
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === "ENOENT") {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      throw e;
    }
  } catch (e) {
    return handleRouteError(e);
  }
}
