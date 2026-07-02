// POST /api/waitlist — unauthenticated out-of-scope demand capture (issue #25).
// No auth surface: this endpoint only ever writes to waitlist_entries. Rate
// limited 5/IP/min via the existing limiter, honeypot-guarded, and idempotent
// on (email, trade, region). No confirmation email (Spam Act 2003 — v1 stores
// intent only).
import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { rateLimitByIp } from "@/lib/auth/rate-limit";
import {
  WaitlistInput,
  isHoneypotTripped,
  normalizeWaitlistEntry,
} from "@/modules/waitlist/schemas";

export async function POST(req: NextRequest): Promise<Response> {
  // ── Rate limit: 5/min per IP (same limiter as signup) ────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimitByIp(ip, "waitlist");
  if (!rl.allowed) {
    return Response.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } }
    );
  }

  // ── Parse + validate body ────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = WaitlistInput.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  // ── Honeypot: a filled hidden field means a bot. Return a success-shaped
  //    response (so the bot can't detect the trap) but never touch the DB. ───
  if (isHoneypotTripped(parsed.data)) {
    return Response.json({ ok: true }, { status: 201 });
  }

  const entry = normalizeWaitlistEntry(parsed.data);

  // ── Idempotent write: (email, trade, region) is unique, so a repeat submit
  //    is a no-op upsert. P2002 covers the concurrent-duplicate race. ────────
  try {
    await db.waitlistEntry.upsert({
      where: {
        email_trade_region: {
          email: entry.email,
          trade: entry.trade,
          region: entry.region,
        },
      },
      create: entry,
      update: {},
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return Response.json({ ok: true }, { status: 200 });
    }
    throw e;
  }

  return Response.json({ ok: true }, { status: 201 });
}
