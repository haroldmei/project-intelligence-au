// GET /s/[slug] — self-hosted URL shortener for SMS links
// system-design §9.2 | FR-011 — shortened links in SMS (no third-party shortener)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { captureAnonymous } from "@/lib/analytics/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse | Response> {
  const { slug } = await params;
  const record = await db.shortUrl.findUnique({ where: { slug } });
  if (!record) {
    return new Response("Not found", { status: 404 });
  }
  // Cookieless clickthrough from an SMS digest link. ShortUrl rows are
  // deterministic per DA URL and shared across users, so no internal user id is
  // available — capture anonymously, keyed on the slug (no person profile, no
  // target URL / DA text in properties).
  captureAnonymous(`sms:${slug}`, "portal_clickthrough", { source: "sms", slug });
  return NextResponse.redirect(record.targetUrl, 302);
}
