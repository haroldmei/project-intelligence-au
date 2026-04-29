// GET /api/digests — list digest history
// FR-026 | system-design §4
import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { getDigestHistory } from "@/modules/portal/loaders";

export async function GET(): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const digests = await getDigestHistory(auth.user.id, 20);
  return NextResponse.json(digests);
}
