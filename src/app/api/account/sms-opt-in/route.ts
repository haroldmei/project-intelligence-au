// POST /api/account/sms-opt-in
// FR-022 | system-design §4
import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { smsOptIn } from "@/modules/account/service";

export async function POST(): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const account = await smsOptIn(auth.user.id);
    return NextResponse.json(account);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 422 });
  }
}
