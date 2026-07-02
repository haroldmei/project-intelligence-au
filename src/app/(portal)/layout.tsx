import { redirect } from "next/navigation";
import Link from "next/link";
import { Newspaper, Clock, MapPin, User } from "lucide-react";
import { validateRequest } from "@/lib/auth/session";
import { AnalyticsProvider } from "@/components/analytics-provider";

const TABS = [
  { href: "/digest", label: "Digest", Icon: Newspaper, ariaLabel: "Current digest" },
  { href: "/history", label: "History", Icon: Clock, ariaLabel: "Digest history" },
  { href: "/account/area", label: "My Area", Icon: MapPin, ariaLabel: "My service area" },
  { href: "/account", label: "Account", Icon: User, ariaLabel: "Account settings" },
];

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Auth gate — redirect to login if unauthenticated
  const auth = await validateRequest();
  if (!auth) {
    redirect("/login");
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
          <nav aria-label="Portal navigation">
            <ul className="space-y-1">
              {TABS.map(({ href, label, Icon, ariaLabel }) => (
                <li key={href}>
                  <Link
                    href={href}
                    aria-label={ariaLabel}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium text-[#334E68] hover:bg-[#F0F4F8] hover:text-[#1E3A5F] min-h-[44px] transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-1"
                  >
                    <Icon size={18} aria-hidden="true" />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
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
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-[#E5E5E5]"
      >
        <ul className="flex items-center">
          {TABS.map(({ href, label, Icon, ariaLabel }) => (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-label={ariaLabel}
                className="flex flex-col items-center justify-center min-h-[56px] py-2 gap-0.5 text-[#627D98] hover:text-[#1E3A5F] transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D97706]"
              >
                <Icon size={22} aria-hidden="true" />
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
