import { basename } from "path";
import { readdir, readFile, unlink, writeFile } from "fs/promises";

import { ValidationError } from "./errors";
import {
  printRowSchema,
  printsFileSchema,
  type PrintRow,
  type PrintsFile,
} from "./schemas";
import { binderIds, readBinders, validateBinderSlots } from "./binders-file";
import { ensureDataLayout } from "./ensure-layout";
import { printSetPath, printsDir } from "./paths";
import { sortPrintRows } from "./sort-prints";

function parseSetCodeFromFilename(file: string): string | null {
  if (!file.endsWith(".json")) return null;
  return basename(file, ".json").toLowerCase();
}

export async function listPrintSetFiles(root: string): Promise<string[]> {
  await ensureDataLayout(root);
  try {
    const names = await readdir(printsDir(root));
    return names
      .map(parseSetCodeFromFilename)
      .filter((c): c is string => c !== null)
      .sort();
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") return [];
    throw e;
  }
}

export async function readPrintsForSet(
  root: string,
  setCode: string,
): Promise<PrintsFile> {
  const path = printSetPath(root, setCode);
  try {
    const raw = await readFile(path, "utf-8");
    return printsFileSchema.parse(JSON.parse(raw));
  } catch (e: unknown) {
    const err = e as NodeJS.ErrnoException;
    if (err?.code === "ENOENT") return { prints: [] };
    throw e;
  }
}

export async function writePrintsForSet(
  root: string,
  setCode: string,
  data: PrintsFile,
) {
  const normalized = setCode.toLowerCase();
  for (const row of data.prints) {
    if (row.set.toLowerCase() !== normalized) {
      throw new ValidationError(
        `Row set "${row.set}" does not match file set "${normalized}"`,
      );
    }
  }
  const parsed = printsFileSchema.parse(data);
  parsed.prints = sortPrintRows(parsed.prints);

  const registry = binderIds(await readBinders(root));
  for (const row of parsed.prints) {
    const err = validateBinderSlots(row.binders, registry);
    if (err) throw new ValidationError(err);
  }

  const path = printSetPath(root, normalized);
  if (parsed.prints.length === 0) {
    try {
      await unlink(path);
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err?.code !== "ENOENT") throw e;
    }
    return;
  }
  await ensureDataLayout(root);
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
}

export async function loadAllPrintRows(root: string): Promise<
  { set: string; row: PrintRow }[]
> {
  const codes = await listPrintSetFiles(root);
  const out: { set: string; row: PrintRow }[] = [];
  for (const code of codes) {
    const file = await readPrintsForSet(root, code);
    for (const row of file.prints) {
      out.push({ set: code, row });
    }
  }
  return out;
}

export async function assertPrintIdUniqueOutsideSet(
  root: string,
  id: string,
  ignoreSet: string,
) {
  const ign = ignoreSet.toLowerCase();
  for (const { set, row } of await loadAllPrintRows(root)) {
    if (row.id !== id) continue;
    if (set.toLowerCase() === ign) continue;
    throw new ValidationError(`Print id ${id} already exists in set file "${set}"`);
  }
}

export async function upsertPrintRow(root: string, row: PrintRow) {
  printRowSchema.parse(row);
  const setCode = row.set.toLowerCase();
  await assertPrintIdUniqueOutsideSet(root, row.id, setCode);

  const file = await readPrintsForSet(root, setCode);
  const idx = file.prints.findIndex((p) => p.id === row.id);
  if (idx >= 0) file.prints[idx] = row;
  else file.prints.push(row);
  await writePrintsForSet(root, setCode, file);
}

export async function deletePrintRow(root: string, setCode: string, id: string) {
  const normalized = setCode.toLowerCase();
  const file = await readPrintsForSet(root, normalized);
  const next = file.prints.filter((p) => p.id !== id);
  if (next.length === file.prints.length) {
    throw new ValidationError(`Print ${id} not found in set ${normalized}`);
  }
  await writePrintsForSet(root, normalized, { prints: next });
}

export function findBinderReferences(
  rows: { set: string; row: PrintRow }[],
  binderId: string,
): { set: string; printId: string; name: string }[] {
  const hits: { set: string; printId: string; name: string }[] = [];
  for (const { set, row } of rows) {
    if (row.binders.some((b) => b.binder === binderId)) {
      hits.push({ set, printId: row.id, name: row.name });
    }
  }
  hits.sort((a, b) =>
    a.set === b.set ? a.printId.localeCompare(b.printId) : a.set.localeCompare(b.set),
  );
  return hits;
}
