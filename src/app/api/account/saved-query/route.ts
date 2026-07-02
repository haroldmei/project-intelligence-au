// GET /api/account/saved-query + PUT /api/account/saved-query
// Re-embeds the saved query on PUT (AI features §A.7 step 6).
import { NextResponse, after } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { rateLimitMutatingByUser } from "@/lib/auth/rate-limit";
import { UpdateSavedQueryInput } from "@/modules/account/schemas";
import { getAccount, updateSavedQuery } from "@/modules/account/service";
import { sendPreviewDigest } from "@/modules/digest/preview";
import { db } from "@/lib/db";
import { captureServer } from "@/lib/analytics/server";

export async function GET(): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const account = await getAccount(auth.user.id);
  return NextResponse.json({ saved_query_text: account?.savedQueryText ?? null });
}

export async function PUT(request: Request): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Tightest limit on the whole API: each PUT triggers an OpenAI
  // embedding + a preview-digest run (LLM rerank). 30/hr is plenty
  // for legitimate edits; defends against burning the cost ceiling.
  const rl = rateLimitMutatingByUser(auth.user.id, "saved-query");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

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

  // Onboarding completes at the FIRST saved-query save (the final onboarding
  // step). Detect null→set here so later edits don't re-fire the event.
  const prior = await db.user.findUnique({
    where: { id: auth.user.id },
    select: { savedQueryText: true },
  });

  const account = await updateSavedQuery(auth.user.id, parsed.data.saved_query_text);

  if (!prior?.savedQueryText) {
    captureServer(auth.user.id, "onboarding_completed", {});
  }

  // Fire the preview digest in the background AFTER the HTTP response is sent.
  // Vercel's `after()` keeps the serverless function alive past the response
  // for up to ~30s — plenty of time for the relevance pipeline. The preview
  // helper is idempotent, so a re-saved query (post-onboarding edit) won't
  // re-fire the email.
  after(async () => {
    try {
      await sendPreviewDigest(auth.user.id);
    } catch {
      // Helper logs internally; swallow here so a failure can't crash the
      // background task and leave a half-baked Digest row.
    }
  });

  return NextResponse.json({ saved_query_text: account.savedQueryText });
}
