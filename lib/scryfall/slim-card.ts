import { catalogCardSchema, type CatalogCard } from "@/lib/mtg/schemas";

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

function pickImageUris(src: unknown): Record<string, string> | undefined {
  const o = asRecord(src);
  if (!o) return undefined;
  const out: Record<string, string> = {};
  for (const key of ["small", "normal", "large", "png", "art_crop", "border_crop"] as const) {
    const x = o[key];
    if (typeof x === "string" && x.length > 0) out[key] = x;
  }
  return Object.keys(out).length ? out : undefined;
}

function slimPrices(p: unknown): Record<string, string | null> | undefined {
  const o = asRecord(p);
  if (!o) return undefined;
  const out: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string" || v === null) out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

export function slimCard(card: Record<string, unknown>): CatalogCard {
  const facesIn = Array.isArray(card.card_faces) ? card.card_faces : [];
  const card_faces = facesIn
    .map((f) => asRecord(f))
    .filter((f): f is Record<string, unknown> => !!f)
    .map((f) => ({
      name: typeof f.name === "string" ? f.name : undefined,
      image_uris: pickImageUris(f.image_uris),
    }))
    .filter((f) => f.image_uris || f.name);

  const cmRaw = card.cardmarket_id;
  const cardmarket_id =
    typeof cmRaw === "number" && Number.isInteger(cmRaw) && cmRaw > 0 ? cmRaw : undefined;

  const draft = {
    catalogVersion: 1 as const,
    id: String(card.id ?? ""),
    name: String(card.name ?? ""),
    set: typeof card.set === "string" ? card.set.toLowerCase() : "",
    set_name: typeof card.set_name === "string" ? card.set_name : undefined,
    collector_number: String(card.collector_number ?? ""),
    rarity: typeof card.rarity === "string" ? card.rarity : undefined,
    type_line: typeof card.type_line === "string" ? card.type_line : undefined,
    image_uris: pickImageUris(card.image_uris),
    card_faces: card_faces.length ? card_faces : undefined,
    prices: slimPrices(card.prices),
    cardmarket_id,
    foil: typeof card.foil === "boolean" ? card.foil : undefined,
    nonfoil: typeof card.nonfoil === "boolean" ? card.nonfoil : undefined,
    scryfall_uri: typeof card.scryfall_uri === "string" ? card.scryfall_uri : undefined,
    uri: typeof card.uri === "string" ? card.uri : undefined,
    updated_at: typeof card.updated_at === "string" ? card.updated_at : undefined,
  };

  return catalogCardSchema.parse(draft);
}
