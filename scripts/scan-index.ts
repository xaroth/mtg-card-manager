import { getMtgDataRoot } from "../lib/mtg/data-root";
import { buildScanIndex } from "../lib/scan/build-index";

async function main() {
  const root = getMtgDataRoot();
  const full = process.argv.includes("--full");
  console.log("MTG_DATA_DIR:", root);
  console.error(`Scan index: ${full ? "full refresh" : "incremental (skip cached images)"}`);
  const state = await buildScanIndex(root, {
    full,
    onProgress: (m) => console.error(m),
  });
  console.error(
    `Done. ${state.hashesBuilt} entries, images ${state.imagesFetched} fetched / ${state.imagesSkipped} skipped, pruned ${state.prunedImages}, errors ${state.errors.length}`,
  );
  if (state.errors.length) {
    for (const e of state.errors.slice(0, 20)) console.error(" ", e);
    if (state.errors.length > 20) console.error(`  … and ${state.errors.length - 20} more`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
