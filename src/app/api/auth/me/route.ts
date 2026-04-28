// GET /api/auth/me
// Returns the minimal session/user shape for the portal.
// Auth: Lucia session required.
// Used by frontend RSC / SWR hooks to hydrate client state.
import { NextRequest } from "next/server";
import { validateRequest } from "@/lib/auth/session";

/** Minimal user shape exposed to the portal client. */
export interface MeResponse {
  userId: string;
  email: string;
  emailVerified: boolean;
  subscriptionStatus: string;
  trade: string;
  sessionExpiresAt: string; // ISO 8601
}

export async function GET(_req: NextRequest): Promise<Response> {
  const auth = await validateRequest();
  if (!auth) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { user, session } = auth;

  const me: MeResponse = {
    userId: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    subscriptionStatus: user.subscriptionStatus,
    trade: user.trade,
    sessionExpiresAt: session.expiresAt.toISOString(),
  };

  return Response.json(me);
}
