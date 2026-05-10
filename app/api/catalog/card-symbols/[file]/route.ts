import { NextResponse } from "next/server";
import { basename } from "path";
import { readFile } from "fs/promises";

import { getMtgDataRoot } from "@/lib/mtg/data-root";
import { catalogCardSymbolPath } from "@/lib/mtg/paths";
import { handleRouteError } from "@/lib/http/handle-error";

const SAFE_SVG = /^[A-Za-z0-9][A-Za-z0-9._-]*\.svg$/;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ file: string }> },
) {
  try {
    const root = getMtgDataRoot();
    const rawName = (await ctx.params).file;
    const name = basename(rawName);
    if (name !== rawName || !SAFE_SVG.test(name)) {
      return new NextResponse("Invalid symbol file", { status: 400 });
    }
    const path = catalogCardSymbolPath(root, name);
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
