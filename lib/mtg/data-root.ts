import { isAbsolute, resolve } from "path";

import { ConfigurationError } from "./errors";

export function getMtgDataRoot(): string {
  const raw = process.env.MTG_DATA_DIR;
  if (!raw?.trim()) {
    throw new ConfigurationError(
      "MTG_DATA_DIR is not set. Set it to an absolute path for your data directory.",
    );
  }
  const trimmed = raw.trim();
  if (!isAbsolute(trimmed)) {
    throw new ConfigurationError("MTG_DATA_DIR must be an absolute filesystem path.");
  }
  return resolve(trimmed);
}
