import { join } from "path";

export function collectionDir(root: string) {
  return join(root, "collection");
}

export function bindersPath(root: string) {
  return join(collectionDir(root), "binders.json");
}

export function printsDir(root: string) {
  return join(collectionDir(root), "prints");
}

export function printSetPath(root: string, setCode: string) {
  return join(printsDir(root), `${setCode.toLowerCase()}.json`);
}

export function configPath(root: string) {
  return join(root, "config.json");
}

export function catalogCardsDir(root: string) {
  return join(root, "catalog", "cards");
}

export function catalogCardPath(root: string, cardId: string) {
  return join(catalogCardsDir(root), `${cardId}.json`);
}

export function catalogSetsDir(root: string) {
  return join(root, "catalog", "sets");
}

export function catalogSetPath(root: string, setCode: string) {
  return join(catalogSetsDir(root), `${setCode.toLowerCase()}.json`);
}

export function catalogSetIconsDir(root: string) {
  return join(root, "catalog", "set-icons");
}

export function catalogSetIconPath(root: string, setCode: string) {
  return join(catalogSetIconsDir(root), `${setCode.toLowerCase()}.svg`);
}

/** Full Scryfall `/symbology` JSON (card mana/symbol catalog). */
export function catalogSymbologyPath(root: string) {
  return join(root, "catalog", "symbology.json");
}

export function catalogCardSymbolsDir(root: string) {
  return join(root, "catalog", "card-symbols");
}

/** Basename only, e.g. `W.svg` from Scryfall `svg_uri`. */
export function catalogCardSymbolPath(root: string, svgBasename: string) {
  return join(catalogCardSymbolsDir(root), svgBasename);
}

export function syncStatePath(root: string) {
  return join(root, "catalog", "sync-state.json");
}

/** Last fetch times for SVG assets (set icons, card symbols). */
export function catalogAssetFetchedAtPath(root: string) {
  return join(root, "catalog", "asset-fetched-at.json");
}
