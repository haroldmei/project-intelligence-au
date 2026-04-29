// POST /api/account/sms-opt-out
// FR-022 | system-design §4
import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { smsOptOut } from "@/modules/account/service";

export async function POST(): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await smsOptOut(auth.user.id);
  return NextResponse.json(account);
}
