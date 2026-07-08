// POST /api/account/email-opt-in — authenticated re-subscribe to the paid
// email digest (#105). The counterpart to the unauthenticated unsubscribe link:
// this is the only in-product way back after tapping "Unsubscribe".
// FR-022 | system-design §4
import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { emailOptIn } from "@/modules/account/service";

export async function POST(): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await emailOptIn(auth.user.id);
  return NextResponse.json(account);
}
