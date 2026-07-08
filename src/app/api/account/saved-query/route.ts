// GET /api/account/saved-query + PUT /api/account/saved-query
// FR-015: saved-query is immutable in V1. PUT returns 403.
// Re-embedding is deferred to V2 (FR-V2-001).
import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { getAccount } from "@/modules/account/service";

export async function GET(): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await getAccount(auth.user.id);
  return NextResponse.json({ saved_query_text: account?.savedQueryText ?? null });
}

export async function PUT(): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // FR-015: saved-query is immutable in V1. The pre-seeded roofing vocabulary
  // embedding is set at account creation (FR-015 §saved-query-seeding). Custom
  // saved queries are FR-V2-001 ([Out-of-wedge → V2]).
  return NextResponse.json(
    { error: "Saved query cannot be changed in V1. Custom queries are available in V2." },
    { status: 403 },
  );
}
