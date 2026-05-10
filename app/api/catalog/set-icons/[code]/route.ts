import { NextResponse } from "next/server";
import { readFile } from "fs/promises";

import { getMtgDataRoot } from "@/lib/mtg/data-root";
import { catalogSetIconPath } from "@/lib/mtg/paths";
import { handleRouteError } from "@/lib/http/handle-error";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  try {
    const root = getMtgDataRoot();
    const { code } = await ctx.params;
    const path = catalogSetIconPath(root, code);
    try {
      const svg = await readFile(path, "utf-8");
      return new NextResponse(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=3600",
        },
      });
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === "ENOENT") {
        return new NextResponse("Not found", { status: 404 });
      }
      throw e;
    }
  } catch (e) {
    return handleRouteError(e);
  }
}
