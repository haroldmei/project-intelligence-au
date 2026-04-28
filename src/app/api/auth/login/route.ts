// POST /api/auth/login
// email + password → argon2id verify → create Lucia session → set cookie.
// contract.auth: lucia + argon2id | system-design §4: 5/IP/min
// Session fixation mitigation: new session created on every login (Lucia default).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/auth/passwords";
import { lucia } from "@/lib/auth/lucia";
import { rateLimitByIp } from "@/lib/auth/rate-limit";
import { serializeLuciaCookie } from "@/lib/auth/session";
import { LoginSchema } from "@/lib/auth/schemas";

export async function POST(req: NextRequest): Promise<Response> {
  // ── Rate limit: 5/min per IP ─────────────────────────────────────────────
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rl = rateLimitByIp(ip, "login");
  if (!rl.allowed) {
    return Response.json(
      { error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSeconds) },
      }
    );
  }

  // ── Parse + validate body ─────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Validation failed.", issues: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }

  const { email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();

  // ── Lookup user ───────────────────────────────────────────────────────────
  const user = await db.user.findUnique({ where: { email: normalizedEmail } });

  // Always run verifyPassword to prevent timing oracle on email existence.
  // Uses a dummy hash when no user is found.
  const DUMMY_HASH =
    "$argon2id$v=19$m=19456,t=2,p=1$dummysaltdummysalt$dummyhashvalueplaceholder";
  const passwordHash = user?.passwordHash ?? DUMMY_HASH;
  const passwordOk = await verifyPassword(passwordHash, password);

  if (!user || !passwordOk) {
    return Response.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  }

  // ── Create Lucia session (session fixation: new session on every login) ───
  const session = await lucia.createSession(user.id, {});
  const sessionCookie = lucia.createSessionCookie(session.id);

  return Response.json(
    { session_set: true },
    {
      status: 200,
      headers: {
        "Set-Cookie": serializeLuciaCookie(sessionCookie),
      },
    }
  );
}
