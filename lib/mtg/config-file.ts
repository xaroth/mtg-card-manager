import { readFile, writeFile } from "fs/promises";

import { appConfigSchema, type AppConfig } from "./schemas";
import { ensureDataLayout } from "./ensure-layout";
import { configPath } from "./paths";

const DEFAULT_QUERY = "(type:land type:basic) is:fullart unique:prints";

export async function readOrCreateConfig(root: string): Promise<AppConfig> {
  await ensureDataLayout(root);
  const path = configPath(root);
  try {
    const raw = await readFile(path, "utf-8");
    const obj = JSON.parse(raw) as Record<string, unknown>;
    const migrated: Record<string, unknown> = { ...obj };
    migrated.defaultSearchQuery =
      (typeof obj.defaultSearchQuery === "string" && obj.defaultSearchQuery) ||
      (typeof obj.defaultScryfallQuery === "string" && obj.defaultScryfallQuery) ||
      DEFAULT_QUERY;
    delete migrated.defaultScryfallQuery;
    return appConfigSchema.parse(migrated);
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code !== "ENOENT") throw e;
    const initial: AppConfig = { defaultSearchQuery: DEFAULT_QUERY };
    await writeFile(path, `${JSON.stringify(initial, null, 2)}\n`, "utf-8");
    return initial;
  }
}

export async function writeConfig(root: string, config: AppConfig) {
  const parsed = appConfigSchema.parse(config);
  await writeFile(configPath(root), `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
}
