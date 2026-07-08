// Stamp the request path+query on a header so server components can preserve it
// as a post-login returnTo (issue #137). Next.js does not surface the request
// URL to a server component / layout, so the portal auth gate has no way to know
// where an unauthenticated visitor was headed — an email feedback tap that lands
// on /digest?feedback=recorded gets bounced to a bare /login and the "feedback
// recorded" confirmation is lost. This is the only thing the middleware does; it
// mutates no responses and runs no DB/session work (Lucia auth stays in the
// layout, off the edge).
import { NextRequest, NextResponse } from "next/server";
import { PATHNAME_HEADER } from "@/lib/auth/return-to";

export function middleware(req: NextRequest) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(
    PATHNAME_HEADER,
    req.nextUrl.pathname + req.nextUrl.search,
  );
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Everything except API routes, Next internals, and static files. In
  // particular this runs on the portal pages (/digest, /account, …) whose auth
  // gate needs the intended path.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
