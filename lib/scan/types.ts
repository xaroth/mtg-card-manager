import type { PrintRow } from "@/lib/mtg/schemas";

export type ScanIndexImageKind =
  | "border_crop"
  | "normal"
  | "png"
  | "large"
  | "small"
  | "art_crop";

export type ScanIndexManifest = {
  version: number;
  builtAt: string;
  imageKind: ScanIndexImageKind;
  hashSizeBits: number;
  entryCount: number;
  cardIds: string[];
};

export type ScanMatchResult = {
  id: string;
  name: string;
  set: string;
  collector_number: string;
  distance: number;
  confidence: number;
  imageUrl: string | null;
  owned: boolean;
  wishlist: boolean;
  print?: PrintRow;
};

export type ScanIndexBuildState = {
  cardTargets: number;
  imagesFetched: number;
  imagesSkipped: number;
  hashesBuilt: number;
  prunedImages: number;
  errors: string[];
};
