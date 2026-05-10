import { NextResponse } from "next/server";

import { getMtgDataRoot } from "@/lib/mtg/data-root";
import { readBinders, writeBinders } from "@/lib/mtg/binders-file";
import { findBinderReferences, loadAllPrintRows } from "@/lib/mtg/prints-files";
import { handleRouteError } from "@/lib/http/handle-error";
import { ValidationError } from "@/lib/mtg/errors";
import { z } from "zod";

const patchSchema = z.object({
  name: z.string().optional(),
  note: z.string().optional(),
});

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const root = getMtgDataRoot();
    const patch = patchSchema.parse(await req.json());
    const data = await readBinders(root);
    const idx = data.binders.findIndex((b) => b.id === id);
    if (idx < 0) throw new ValidationError(`Binder not found: ${id}`);
    data.binders[idx] = {
      ...data.binders[idx],
      ...patch,
      id,
    };
    await writeBinders(root, data);
    return NextResponse.json(data.binders[idx]);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await ctx.params;
    const root = getMtgDataRoot();
    const rows = await loadAllPrintRows(root);
    const refs = findBinderReferences(rows, id);
    if (refs.length > 0) {
      return NextResponse.json(
        { error: "Binder still referenced", references: refs },
        { status: 409 },
      );
    }
    const data = await readBinders(root);
    const next = data.binders.filter((b) => b.id !== id);
    if (next.length === data.binders.length) {
      throw new ValidationError(`Binder not found: ${id}`);
    }
    await writeBinders(root, { binders: next });
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return handleRouteError(e);
  }
}
