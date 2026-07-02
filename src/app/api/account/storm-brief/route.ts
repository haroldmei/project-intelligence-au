// POST /api/account/storm-brief — per-user storm-brief opt-in/out (#20)
// Body: { optIn: boolean }
import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { StormBriefOptInInput } from "@/modules/account/schemas";
import { setStormBriefOptIn } from "@/modules/account/service";

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = StormBriefOptInInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const account = await setStormBriefOptIn(auth.user.id, parsed.data.optIn);
  return NextResponse.json(account);
}
