import { NextResponse } from "next/server";

import { ConfigurationError, ValidationError } from "@/lib/mtg/errors";

export function handleRouteError(e: unknown): NextResponse {
  if (e instanceof ConfigurationError) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  if (e instanceof ValidationError) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  if (e instanceof Error && e.message.includes("MTG_DATA_DIR")) {
    return NextResponse.json({ error: e.message }, { status: 503 });
  }
  console.error(e);
  return NextResponse.json(
    { error: e instanceof Error ? e.message : "Internal error" },
    { status: 500 },
  );
}
