"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Newspaper, Clock, MapPin, User } from "lucide-react";

const TABS = [
  { href: "/digest", label: "Digest", Icon: Newspaper, ariaLabel: "Current digest" },
  { href: "/history", label: "History", Icon: Clock, ariaLabel: "Digest history" },
  { href: "/account/area", label: "My Area", Icon: MapPin, ariaLabel: "My service area" },
  { href: "/account", label: "Account", Icon: User, ariaLabel: "Account settings" },
];

// The active tab is the one whose href is the LONGEST matching prefix of the
// current path. Longest-prefix wins so that on "/account/area" the "My Area"
// tab lights up rather than "Account" (both are prefixes) — exactly one tab is
// ever active.
function activeHref(pathname: string): string | null {
  const matches = TABS.map((t) => t.href).filter(
    (href) => pathname === href || pathname.startsWith(href + "/"),
  );
  if (matches.length === 0) return null;
  return matches.reduce((longest, href) =>
    href.length > longest.length ? href : longest,
  );
}

export function PortalNav({ variant }: { variant: "sidebar" | "mobile" }) {
  const pathname = usePathname();
  const active = activeHref(pathname);

  if (variant === "sidebar") {
    return (
      <nav aria-label="Portal navigation">
        <ul className="space-y-1">
          {TABS.map(({ href, label, Icon, ariaLabel }) => {
            const isActive = href === active;
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-label={ariaLabel}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm min-h-[44px] transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-1 ${
                    isActive
                      ? "bg-[#FDF3E7] text-[#B45309] font-semibold"
                      : "font-medium text-[#334E68] hover:bg-[#F0F4F8] hover:text-[#1E3A5F]"
                  }`}
                >
                  <Icon size={18} aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    );
  }

  return (
    <nav
      aria-label="Mobile navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-[#E5E5E5]"
    >
      <ul className="flex items-center">
        {TABS.map(({ href, label, Icon, ariaLabel }) => {
          const isActive = href === active;
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-label={ariaLabel}
                aria-current={isActive ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center min-h-[56px] py-2 gap-0.5 transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D97706] ${
                  isActive ? "text-[#D97706]" : "text-[#627D98] hover:text-[#1E3A5F]"
                }`}
              >
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-[#D97706]"
                  />
                )}
                <Icon size={22} aria-hidden="true" />
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
