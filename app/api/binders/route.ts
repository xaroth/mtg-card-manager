import { NextResponse } from "next/server";

import { getMtgDataRoot } from "@/lib/mtg/data-root";
import { readBinders, writeBinders } from "@/lib/mtg/binders-file";
import { binderEntrySchema } from "@/lib/mtg/schemas";
import { handleRouteError } from "@/lib/http/handle-error";
import { ValidationError } from "@/lib/mtg/errors";

export async function GET() {
  try {
    const root = getMtgDataRoot();
    const data = await readBinders(root);
    return NextResponse.json(data);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const root = getMtgDataRoot();
    const row = binderEntrySchema.parse(await req.json());
    const data = await readBinders(root);
    if (data.binders.some((b) => b.id === row.id)) {
      throw new ValidationError(`Binder id already exists: ${row.id}`);
    }
    data.binders.push(row);
    data.binders.sort((a, b) => a.id.localeCompare(b.id));
    await writeBinders(root, data);
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
