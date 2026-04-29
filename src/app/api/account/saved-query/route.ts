// GET /api/account/saved-query + PUT /api/account/saved-query
// Re-embeds the saved query on PUT (AI features §A.7 step 6).
import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { UpdateSavedQueryInput } from "@/modules/account/schemas";
import { getAccount, updateSavedQuery } from "@/modules/account/service";

export async function GET(): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await getAccount(auth.user.id);
  return NextResponse.json({ saved_query_text: account?.savedQueryText ?? null });
}

export async function PUT(request: Request): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = UpdateSavedQueryInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const account = await updateSavedQuery(auth.user.id, parsed.data.saved_query_text);
  return NextResponse.json({ saved_query_text: account.savedQueryText });
}
