export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const dir = process.env.MTG_DATA_DIR?.trim();
  if (!dir) {
    console.error(
      "\n[mtg-card-manager] MTG_DATA_DIR is not set. Configure an absolute path to your MTG dataset root before running the app or CLI.\n",
    );
  }
}
