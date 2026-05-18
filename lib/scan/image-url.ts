import type { CatalogCard } from "@/lib/mtg/schemas";
import type { ScanIndexImageKind } from "@/lib/scan/types";

const FALLBACK_KINDS: ScanIndexImageKind[] = [
  "border_crop",
  "normal",
  "png",
  "large",
  "small",
];

export function pickScanImageUrl(
  card: CatalogCard,
  preferred: ScanIndexImageKind,
): string | undefined {
  const tryUris = (uris: Record<string, string> | undefined) => {
    if (!uris) return undefined;
    if (uris[preferred]) return uris[preferred];
    for (const k of FALLBACK_KINDS) {
      if (uris[k]) return uris[k];
    }
    return undefined;
  };

  const main = tryUris(card.image_uris);
  if (main) return main;
  const face = card.card_faces?.[0]?.image_uris;
  return tryUris(face);
}

export function pickThumbnailUrl(card: CatalogCard): string | null {
  const uris = card.image_uris ?? card.card_faces?.[0]?.image_uris;
  if (!uris) return null;
  return uris.small ?? uris.normal ?? uris.border_crop ?? uris.png ?? null;
}
