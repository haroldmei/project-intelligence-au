// POST /api/account/email-opt-out — authenticated opt-out of the email digest
// (#105). Mirror of email-opt-in so the notifications page can drive a single
// bidirectional toggle. The unauthenticated token link at
// /api/unsubscribe/[token] remains the Spam-Act one-click path.
// FR-022 | system-design §4
import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { emailOptOut } from "@/modules/account/service";

export async function POST(): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await emailOptOut(auth.user.id);
  return NextResponse.json(account);
}
