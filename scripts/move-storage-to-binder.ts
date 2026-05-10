/**
 * One-off: for each print with copies in storage but none allocated to binders,
 * move up to 1 nonfoil and up to 1 foil from storage into a single binder slot.
 *
 * Usage: pnpm exec tsx scripts/move-storage-to-binder.ts [--dry-run]
 */
import { getMtgDataRoot } from "../lib/mtg/data-root";
import { binderIds, readBinders } from "../lib/mtg/binders-file";
import {
  listPrintSetFiles,
  readPrintsForSet,
  writePrintsForSet,
} from "../lib/mtg/prints-files";
import type { PrintRow } from "../lib/mtg/schemas";

const TARGET_BINDER = "gamegenic-4x3-binder-1";

function totalBinderCopies(binders: PrintRow["binders"]): number {
  return binders.reduce((sum, b) => sum + b.nonfoil + b.foil, 0);
}

async function main() {
  const root = getMtgDataRoot();
  const dryRun = process.argv.includes("--dry-run");

  const registry = binderIds(await readBinders(root));
  if (!registry.has(TARGET_BINDER)) {
    console.error(`Binder id not found in binders.json: ${TARGET_BINDER}`);
    process.exit(1);
  }

  let updated = 0;
  const setCodes = await listPrintSetFiles(root);

  for (const setCode of setCodes) {
    const file = await readPrintsForSet(root, setCode);
    let dirty = false;

    for (const row of file.prints) {
      const inStorage = row.storage.nonfoil + row.storage.foil;
      if (inStorage <= 0) continue;
      if (totalBinderCopies(row.binders) > 0) continue;

      const addNon = row.storage.nonfoil > 0 ? 1 : 0;
      const addFoil = row.storage.foil > 0 ? 1 : 0;
      if (addNon === 0 && addFoil === 0) continue;

      const label = `${row.set} ${row.collector_number} ${row.name}`;
      console.log(
        `${dryRun ? "[dry-run] " : ""}${label}: storage ${row.storage.nonfoil}n/${row.storage.foil}f -> binder +${addNon}n/+${addFoil}f`,
      );

      if (!dryRun) {
        row.storage.nonfoil -= addNon;
        row.storage.foil -= addFoil;

        const idx = row.binders.findIndex((b) => b.binder === TARGET_BINDER);
        if (idx >= 0) {
          const slot = row.binders[idx]!;
          slot.nonfoil += addNon;
          slot.foil += addFoil;
        } else {
          row.binders.push({
            binder: TARGET_BINDER,
            nonfoil: addNon,
            foil: addFoil,
          });
        }
      }

      dirty = true;
      updated++;
    }

    if (dirty && !dryRun) {
      await writePrintsForSet(root, setCode, file);
    }
  }

  console.error(
    `Done. ${updated} print row(s) ${dryRun ? "would be " : ""}updated.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
