// GET /s/[slug] — self-hosted URL shortener for SMS links
// system-design §9.2 | FR-011 — shortened links in SMS (no third-party shortener)
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
): Promise<NextResponse | Response> {
  const { slug } = await params;
  const record = await db.shortUrl.findUnique({ where: { slug } });
  if (!record) {
    return new Response("Not found", { status: 404 });
  }
  return NextResponse.redirect(record.targetUrl, 302);
}
