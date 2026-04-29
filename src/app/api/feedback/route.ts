// POST /api/feedback — authenticated portal thumb up/down
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-024 | system-design §4 API design — POST /api/portal/feedback (Lucia auth, 100/user/hr)
import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { PortalFeedbackInput } from "@/modules/feedback/schemas";
import { recordFeedback, removeFeedback } from "@/modules/feedback/service";

export async function POST(request: Request): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = PortalFeedbackInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  }

  const { da_id, feedback } = parsed.data;
  if (feedback === "remove") {
    await removeFeedback(auth.user.id, da_id);
  } else {
    await recordFeedback(auth.user.id, da_id, feedback, "portal");
  }
  return NextResponse.json({ ok: true });
}
