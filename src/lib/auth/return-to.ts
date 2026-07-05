// returnTo plumbing for the portal auth wall (issue #137).
//
// Server components (the portal layout, the /digest page) gate on a session and
// redirect to /login when there is none. Next.js does not expose the request
// URL to a server component, so the middleware stamps the intended path+query on
// a request header (PATHNAME_HEADER); the gate reads it and preserves it as
// ?returnTo so the login page can send the user back where they were headed —
// e.g. the /digest?feedback=recorded toast an unauthenticated email feedback tap
// would otherwise lose.
//
// This module is intentionally PURE (no next/headers, no next/navigation): it is
// imported by both the edge middleware and the client login component.

/** Header the middleware stamps with the full request path+query. */
export const PATHNAME_HEADER = "x-pathname";

/** Default post-login destination when there is no (valid) returnTo. */
export const DEFAULT_RETURN_TO = "/digest";

/**
 * Constrain a returnTo to an internal absolute path. Blocks protocol-relative
 * (`//evil.com`) and backslash (`/\evil.com`) forms that browsers may resolve as
 * external — closing an open-redirect via a crafted /login?returnTo= link.
 */
export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith("/")) return DEFAULT_RETURN_TO;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return DEFAULT_RETURN_TO;
  return raw;
}

/**
 * Build the /login redirect target for an unauthenticated request, preserving
 * the intended destination as ?returnTo. `target` is the value the middleware
 * stamped on PATHNAME_HEADER (already internal). When it resolves to the default
 * destination the param is omitted — login lands there anyway.
 */
export function buildLoginRedirect(target: string | null | undefined): string {
  const safe = sanitizeReturnTo(target);
  if (safe === DEFAULT_RETURN_TO) return "/login";
  return `/login?returnTo=${encodeURIComponent(safe)}`;
}
