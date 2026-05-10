import { NextResponse } from "next/server";

import { getMtgDataRoot } from "@/lib/mtg/data-root";
import { readOrCreateConfig, writeConfig } from "@/lib/mtg/config-file";
import { handleRouteError } from "@/lib/http/handle-error";
import { appConfigSchema } from "@/lib/mtg/schemas";

export async function GET() {
  try {
    const root = getMtgDataRoot();
    const config = await readOrCreateConfig(root);
    return NextResponse.json(config);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const root = getMtgDataRoot();
    const patch = appConfigSchema.partial().parse(await req.json());
    const current = await readOrCreateConfig(root);
    await writeConfig(root, { ...current, ...patch });
    return NextResponse.json(await readOrCreateConfig(root));
  } catch (e) {
    return handleRouteError(e);
  }
}
