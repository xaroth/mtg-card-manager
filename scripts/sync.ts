import { getMtgDataRoot } from "../lib/mtg/data-root";
import { runSync } from "../lib/scryfall/sync-catalog";

async function main() {
  const root = getMtgDataRoot();
  const full = process.argv.includes("--full");
  const cardsOnly = process.argv.includes("--cards-only");
  console.log("MTG_DATA_DIR:", root);
  const parts = [
    cardsOnly ? "cards-only (catalog JSON only)" : "full catalog",
    full ? "full refresh" : "incremental (skip card files fetched within 12h)",
  ];
  console.error(`Mode: ${parts.join(" · ")}`);
  await runSync(root, { onProgress: (m) => console.error(m), full, cardsOnly });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
