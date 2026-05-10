import { readFile, writeFile } from "fs/promises";

import { bindersFileSchema, type BindersFile } from "./schemas";
import { ensureDataLayout } from "./ensure-layout";
import { bindersPath } from "./paths";

export async function readBinders(root: string): Promise<BindersFile> {
  await ensureDataLayout(root);
  const path = bindersPath(root);
  try {
    const raw = await readFile(path, "utf-8");
    return bindersFileSchema.parse(JSON.parse(raw));
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code !== "ENOENT") throw e;
    const empty: BindersFile = { binders: [] };
    await writeFile(path, `${JSON.stringify(empty, null, 2)}\n`, "utf-8");
    return empty;
  }
}

export async function writeBinders(root: string, data: BindersFile) {
  const parsed = bindersFileSchema.parse(data);
  await writeFile(bindersPath(root), `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
}

export function binderIds(data: BindersFile): Set<string> {
  return new Set(data.binders.map((b) => b.id));
}

export function validateBinderSlots(
  rowBinders: { binder: string }[],
  registry: Set<string>,
): string | null {
  for (const s of rowBinders) {
    if (!registry.has(s.binder)) {
      return `Unknown binder id: ${s.binder}`;
    }
  }
  const seen = new Set<string>();
  for (const s of rowBinders) {
    if (seen.has(s.binder)) return `Duplicate binder slot: ${s.binder}`;
    seen.add(s.binder);
  }
  return null;
}
