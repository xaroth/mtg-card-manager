import { NextResponse } from "next/server";

import { getMtgDataRoot } from "@/lib/mtg/data-root";
import { deletePrintRow, upsertPrintRow } from "@/lib/mtg/prints-files";
import { printRowSchema } from "@/lib/mtg/schemas";
import { handleRouteError } from "@/lib/http/handle-error";
import { ValidationError } from "@/lib/mtg/errors";

export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ set: string; printId: string }> },
) {
  try {
    const { set, printId } = await ctx.params;
    const root = getMtgDataRoot();
    const row = printRowSchema.parse(await req.json());
    if (row.id !== printId) {
      throw new ValidationError("Body id must match URL printId");
    }
    if (row.set.toLowerCase() !== set.toLowerCase()) {
      throw new ValidationError("Body set must match URL set");
    }
    await upsertPrintRow(root, row);
    return NextResponse.json(row);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ set: string; printId: string }> },
) {
  try {
    const { set, printId } = await ctx.params;
    const root = getMtgDataRoot();
    await deletePrintRow(root, set, printId);
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return handleRouteError(e);
  }
}
