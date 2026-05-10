import { NextResponse } from "next/server";

import { getMtgDataRoot } from "@/lib/mtg/data-root";
import { readOrCreateConfig } from "@/lib/mtg/config-file";
import {
  assertAllowedScryfallApiUrl,
  configureLanesFromDataRoot,
  scryfallGet,
} from "@/lib/scryfall/client";
import { handleRouteError } from "@/lib/http/handle-error";

/** Maps UI/client `sort` to Scryfall `/cards/search` `order` */
const ALLOWED_SEARCH_SORT = new Set(["released", "name", "set"]);

export async function GET(req: Request) {
  try {
    const root = getMtgDataRoot();
    await configureLanesFromDataRoot(root);

    const url = new URL(req.url);
    const next = url.searchParams.get("next");
    const cfg = await readOrCreateConfig(root);

    let target: string;
    if (next) {
      const decoded = decodeURIComponent(next);
      assertAllowedScryfallApiUrl(decoded);
      target = decoded;
    } else {
      const q = url.searchParams.get("q")?.trim();
      const query = q && q.length > 0 ? q : cfg.defaultSearchQuery;
      const sortRaw = url.searchParams.get("sort")?.trim().toLowerCase() ?? "";
      const order = ALLOWED_SEARCH_SORT.has(sortRaw) ? sortRaw : "released";
      target = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}&order=${encodeURIComponent(order)}`;
    }

    const res = await scryfallGet(target);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    return handleRouteError(e);
  }
}
