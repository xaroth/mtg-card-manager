import { mkdir } from "fs/promises";

import {
  catalogCardSymbolsDir,
  catalogCardsDir,
  catalogSetIconsDir,
  catalogSetsDir,
  collectionDir,
  printsDir,
} from "./paths";

export async function ensureDataLayout(root: string) {
  await mkdir(collectionDir(root), { recursive: true });
  await mkdir(printsDir(root), { recursive: true });
  await mkdir(catalogCardsDir(root), { recursive: true });
  await mkdir(catalogSetsDir(root), { recursive: true });
  await mkdir(catalogSetIconsDir(root), { recursive: true });
  await mkdir(catalogCardSymbolsDir(root), { recursive: true });
}
