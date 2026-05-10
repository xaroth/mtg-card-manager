import { NextResponse } from "next/server";
import { readFile } from "fs/promises";

import { getMtgDataRoot } from "@/lib/mtg/data-root";
import { runSync } from "@/lib/scryfall/sync-catalog";
import { syncStatePath } from "@/lib/mtg/paths";
import { handleRouteError } from "@/lib/http/handle-error";

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    const root = getMtgDataRoot();
    const url = new URL(req.url);
    const full =
      url.searchParams.get("full") === "1" ||
      url.searchParams.get("full") === "true";
    const cardsOnly =
      url.searchParams.get("cards_only") === "1" ||
      url.searchParams.get("cards_only") === "true";
    void runSync(root, { full, cardsOnly }).catch((e) => console.error("[sync]", e));
    return NextResponse.json({ accepted: true, full, cardsOnly }, { status: 202 });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function GET() {
  try {
    const root = getMtgDataRoot();
    try {
      const raw = await readFile(syncStatePath(root), "utf-8");
      return NextResponse.json(JSON.parse(raw));
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code === "ENOENT") {
        return NextResponse.json({ message: "No sync run yet" });
      }
      throw e;
    }
  } catch (e) {
    return handleRouteError(e);
  }
}
