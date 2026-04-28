// POST /api/auth/logout
// Invalidates the current Lucia session and clears the session cookie.
// No rate limit (session-gated; DoS risk negligible).
// CSRF: SameSite=Lax cookie + same-origin POST is the defence (system-design §6.1).
import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { lucia } from "@/lib/auth/lucia";
import { serializeLuciaCookie } from "@/lib/auth/session";

export async function POST(_req: NextRequest): Promise<Response> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(lucia.sessionCookieName)?.value ?? null;

  if (sessionId) {
    // Invalidate the session server-side (makes the cookie value worthless)
    await lucia.invalidateSession(sessionId);
  }

  // Clear the cookie regardless of whether the session existed
  const blankCookie = lucia.createBlankSessionCookie();

  return Response.json(
    { ok: true },
    {
      status: 200,
      headers: {
        "Set-Cookie": serializeLuciaCookie(blankCookie),
      },
    }
  );
}
