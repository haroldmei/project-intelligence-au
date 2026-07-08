import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { User } from "lucide-react";
import { validateRequest } from "@/lib/auth/session";
import { PATHNAME_HEADER, buildLoginRedirect } from "@/lib/auth/return-to";
import { AnalyticsProvider } from "@/components/analytics-provider";
import { PortalNav } from "./portal-nav";

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth gate — redirect to login if unauthenticated, preserving where the user
  // was headed as ?returnTo (issue #137) so an email feedback tap doesn't lose
  // its /digest?feedback=recorded confirmation behind the login wall.
  const auth = await validateRequest();
  if (!auth) {
    const target = (await headers()).get(PATHNAME_HEADER);
    redirect(buildLoginRedirect(target));
  }

  // Verification gate (issue #180) — a Lucia session is minted at signup with
  // emailVerified=false, so an authenticated-but-unverified user could otherwise
  // land on /digest and see "your first digest arrives Sunday". But the Sunday
  // cron hard-filters emailVerified:true (src/modules/digest/cron.ts), so that
  // user would never receive anything and is never re-prompted — a silent dead
  // end. Bounce them to /verify (which resends/edits the OTP) until verified.
  if (!auth.user.emailVerified) {
    redirect("/verify");
  }

  return (
    <div className="min-h-screen bg-[#F0F4F8] flex flex-col">
      {/* Identify the authenticated browser by internal user id (consent-gated). */}
      <AnalyticsProvider userId={auth.user.id} />
      {/* Top app bar (mobile) / sticky header */}
      <header className="sticky top-0 z-20 bg-[#1E3A5F] text-white px-4 h-14 flex items-center justify-between">
        <span className="font-bold text-sm tracking-tight">ProjectIntelligence</span>
        <Link
          href="/account"
          aria-label="Account settings"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 focus-visible:ring-offset-[#1E3A5F]"
        >
          <User size={20} aria-hidden="true" />
        </Link>
      </header>

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden lg:grid lg:grid-cols-[240px_1fr]">
        {/* Sidebar — desktop only */}
        <aside className="hidden lg:flex flex-col bg-white border-r border-[#E5E5E5] py-6 px-4">
          <PortalNav variant="sidebar" />
        </aside>

        {/* Page content */}
        <main
          id="main-content"
          className="flex-1 overflow-y-auto pb-20 lg:pb-6"
        >
          {children}
        </main>
      </div>

      {/* Bottom tab bar — mobile only */}
      <PortalNav variant="mobile" />
    </div>
  );
}
