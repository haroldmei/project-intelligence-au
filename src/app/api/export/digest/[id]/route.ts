// GET /api/export/digest/[id].csv — CSV download of a digest's leads (issue #22).
// Buyer-expectation parity with DA Leads / Council DA (both ship CSV/API).
// Ownership is enforced by getDigestById(userId, id): a digest belonging to
// another user simply isn't found → 404 (no existence leak).
import { NextResponse } from "next/server";
import { validateRequest } from "@/lib/auth/session";
import { rateLimitMutatingByUser } from "@/lib/auth/rate-limit";
import { getDigestById } from "@/modules/portal/loaders";
import { buildDigestCsv, csvFilename } from "@/modules/digest/export";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const auth = await validateRequest();
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Reuse the per-user mutating limiter (30/hr). An export is a cheap read, but
  // this caps someone scripting bulk pulls of the whole history.
  const rl = rateLimitMutatingByUser(auth.user.id, "export-csv");
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
    );
  }

  // The public URL is `/api/export/digest/<id>.csv`; the `.csv` is a cosmetic
  // suffix on the dynamic segment so the download lands with a sensible name
  // even before Content-Disposition. Strip it back to the real digest id.
  const { id: rawId } = await params;
  const id = rawId.replace(/\.csv$/i, "");

  const digest = await getDigestById(auth.user.id, id);
  if (!digest) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const csv = buildDigestCsv(digest);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(digest.runDate)}"`,
      // Never cache a personalised lead list at a shared CDN.
      "Cache-Control": "private, no-store",
    },
  });
}
