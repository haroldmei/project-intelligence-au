// Server-side session helper — used by API routes and Server Components.
// contract.auth.default = lucia | session = jwt-with-refresh
// system-design §6.1: httpOnly, SameSite=Lax, Secure cookies.
import { cookies } from "next/headers";
import { lucia } from "@/lib/auth/lucia";
import type { Session, User } from "lucia";

export type ValidatedRequest = {
  user: User;
  session: Session;
};

/**
 * Read and validate the Lucia session cookie.
 * Returns { user, session } or null if the cookie is missing / expired / invalid.
 * Call this at the top of every authenticated API route handler and server component.
 *
 * Side effects:
 * - If the session is valid but close to expiry, Lucia extends it (rolling expiry).
 * - Sets Set-Cookie header on the response when the session is extended (handled by Lucia).
 */
export async function validateRequest(): Promise<ValidatedRequest | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(lucia.sessionCookieName)?.value ?? null;
  if (!sessionId) return null;

  const { session, user } = await lucia.validateSession(sessionId);
  if (!session) return null;

  return { session, user };
}

/**
 * Serialise a Lucia cookie object (name + value + CookieAttributes) into a
 * Set-Cookie header value string.
 * Uses only the known subset of CookieAttributes rather than a generic index signature.
 */
export function serializeLuciaCookie(cookie: {
  name: string;
  value: string;
  attributes: {
    secure?: boolean;
    path?: string;
    domain?: string;
    sameSite?: "lax" | "strict" | "none";
    httpOnly?: boolean;
    maxAge?: number;
    expires?: Date;
  };
}): string {
  const parts: string[] = [`${cookie.name}=${cookie.value}`];
  const a = cookie.attributes;
  if (a.httpOnly) parts.push("HttpOnly");
  if (a.secure) parts.push("Secure");
  if (a.sameSite) parts.push(`SameSite=${a.sameSite}`);
  if (a.path) parts.push(`Path=${a.path}`);
  if (a.domain) parts.push(`Domain=${a.domain}`);
  if (a.maxAge !== undefined) parts.push(`Max-Age=${a.maxAge}`);
  if (a.expires) parts.push(`Expires=${a.expires.toUTCString()}`);
  return parts.join("; ");
}
