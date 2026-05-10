import { readOrCreateConfig } from "@/lib/mtg/config-file";
import { ValidationError } from "@/lib/mtg/errors";

const USER_AGENT = "mtg-card-manager/1.0 (private collection sync; Scryfall-compliant)";

function makeLimiter(minIntervalMs: number) {
  let last = 0;
  let queue = Promise.resolve();
  return function schedule<T>(fn: () => Promise<T>): Promise<T> {
    const job = queue.then(async () => {
      const now = Date.now();
      const elapsed = now - last;
      if (elapsed < minIntervalMs) {
        await new Promise((r) => setTimeout(r, minIntervalMs - elapsed));
      }
      last = Date.now();
      return fn();
    });
    queue = job.then(() => {}).catch(() => {});
    return job;
  };
}

/** Defaults tuned below Scryfall's typical ~10 req/s guidance to reduce 429s. */
let fastLane = makeLimiter(125);
let slowLane = makeLimiter(200);
/** SVG / CDN fetches were unlimited; serialize these too (symbology + set icons). */
let assetLane = makeLimiter(175);

export async function configureLanesFromDataRoot(root: string): Promise<void> {
  const cfg = await readOrCreateConfig(root);
  fastLane = makeLimiter(cfg.fastLaneMinIntervalMs ?? 125);
  slowLane = makeLimiter(cfg.slowLaneMinIntervalMs ?? 200);
  assetLane = makeLimiter(cfg.assetLaneMinIntervalMs ?? 175);
}

function laneForUrl(url: string): typeof fastLane {
  try {
    const u = new URL(url);
    if (u.hostname !== "api.scryfall.com") return slowLane;
    if (u.pathname.includes("/cards/search")) return fastLane;
    return slowLane;
  } catch {
    return slowLane;
  }
}

export function assertAllowedScryfallApiUrl(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ValidationError("Invalid Scryfall URL");
  }
  if (u.protocol !== "https:") {
    throw new ValidationError("Scryfall URLs must use HTTPS");
  }
  if (u.hostname !== "api.scryfall.com") {
    throw new ValidationError("Only api.scryfall.com URLs are allowed");
  }
}

/** SVG and static assets from Scryfall (`icon_svg_uri`, symbology `svg_uri`, etc.). */
export function assertAllowedScryfallAssetUrl(url: string): void {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new ValidationError("Invalid Scryfall asset URL");
  }
  if (u.protocol !== "https:") {
    throw new ValidationError("Scryfall asset URLs must use HTTPS");
  }
  const h = u.hostname;
  if (h.endsWith(".scryfall.io") || h === "cdn.scryfall.com") return;
  throw new ValidationError(`Disallowed Scryfall asset host: ${h}`);
}

export async function scryfallAssetGet(url: string): Promise<Response> {
  assertAllowedScryfallAssetUrl(url);
  return assetLane(() =>
    fetch(url, {
      headers: {
        Accept: "image/svg+xml,*/*;q=0.8",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    }),
  );
}

export async function scryfallGet(url: string): Promise<Response> {
  assertAllowedScryfallApiUrl(url);
  const limiter = laneForUrl(url);
  return limiter(() =>
    fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": USER_AGENT,
      },
      cache: "no-store",
    }),
  );
}
