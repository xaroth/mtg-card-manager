import { readFile, writeFile } from "fs/promises";

import { getMtgDataRoot } from "../lib/mtg/data-root";
import { configureLanesFromDataRoot, scryfallGet } from "../lib/scryfall/client";
import { ensureDataLayout } from "../lib/mtg/ensure-layout";
import { writePrintsForSet } from "../lib/mtg/prints-files";
import type { PrintRow } from "../lib/mtg/schemas";
import { sortPrintRows } from "../lib/mtg/sort-prints";

type LegacyTuple = [number | string, string, number?, number?, number?, number?];

async function fetchCardBySetCollector(
  set: string,
  collector: string,
): Promise<Record<string, unknown> | null> {
  const url = `https://api.scryfall.com/cards/${encodeURIComponent(set)}/${encodeURIComponent(collector)}`;
  const res = await scryfallGet(url);
  if (!res.ok) return null;
  return res.json() as Promise<Record<string, unknown>>;
}

function tupleToRow(setCode: string, t: LegacyTuple, card: Record<string, unknown>): PrintRow {
  const normal = t[2] ?? 0;
  const foil = t[3] ?? 0;
  const set =
    typeof card.set === "string" && card.set.length > 0
      ? card.set.toLowerCase()
      : setCode.toLowerCase();
  return {
    id: String(card.id),
    set,
    collector_number: String(card.collector_number ?? t[0]),
    name: String(card.name ?? t[1]),
    storage: { nonfoil: Number(normal), foil: Number(foil) },
    binders: [],
    note: "",
  };
}

async function main() {
  const legacyPath = process.argv[2];
  if (!legacyPath) {
    console.error("Usage: pnpm import-legacy <path/to/collection.json>");
    process.exit(1);
  }
  const root = getMtgDataRoot();
  await ensureDataLayout(root);
  await configureLanesFromDataRoot(root);

  const raw = JSON.parse(await readFile(legacyPath, "utf-8")) as Record<
    string,
    unknown
  >;

  const meta = new Set(["_fmt_", "_sets_"]);
  const errors: string[] = [];

  for (const key of Object.keys(raw)) {
    if (meta.has(key)) continue;
    const tuples = raw[key] as LegacyTuple[];
    if (!Array.isArray(tuples)) continue;
    const setCode = key.toLowerCase();
    const prints: PrintRow[] = [];
    console.log(`Set ${setCode}: ${tuples.length} rows`);

    for (const t of tuples) {
      const collector = String(t[0]);
      const card = await fetchCardBySetCollector(setCode, collector);
      if (!card || typeof card.id !== "string") {
        errors.push(`${setCode} #${collector}: not resolved`);
        continue;
      }
      prints.push(tupleToRow(setCode, t, card));
    }

    const sorted = sortPrintRows(prints);
    if (sorted.length > 0) {
      await writePrintsForSet(root, setCode, { prints: sorted });
    }
  }

  await writeFile(
    `${root}/import-legacy-report.json`,
    `${JSON.stringify({ errors }, null, 2)}\n`,
    "utf-8",
  );
  console.log(`Done. ${errors.length} errors — see import-legacy-report.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
