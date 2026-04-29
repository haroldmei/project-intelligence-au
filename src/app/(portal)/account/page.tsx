"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CancelSubscriptionDialog } from "@/components/cancel-subscription-dialog";
import { Button } from "@/components/ui/button";

// TODO: fetch from GET /api/account once backend-developer publishes the route.
// Stub values for now.
const STUB_ACCOUNT = {
  email: "eli@example.com",
  plan: "Solo",
  priceLabel: "AUD 199/mo + GST",
  seats: 1,
  nextCharge: "27 May 2026",
  periodEnd: "2026-05-24T00:00:00Z",
  subscriptionStatus: "active" as "active" | "trial" | "cancelled",
  trialEnd: null as string | null,
};

export default function AccountPage() {
  const router = useRouter();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const account = STUB_ACCOUNT;

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* best-effort — session cleared server-side; redirect regardless */
    }
    router.push("/login");
  }

  return (
    <div className="px-4 py-6 space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold text-[#102A43]">Account</h1>

      {/* Profile */}
      <section aria-label="Profile" className="space-y-2">
        <h2 className="text-sm font-semibold text-[#627D98] uppercase tracking-wide">
          Profile
        </h2>
        <div className="bg-white rounded-md border border-[#E5E5E5] divide-y divide-[#F5F5F5]">
          <Row label="Email" value={account.email} />
          <RowLink label="Notifications" href="/account/sms" />
          <RowLink label="My Service Area" href="/account/area" />
        </div>
      </section>

      {/* Subscription */}
      <section aria-label="Subscription" className="space-y-2">
        <h2 className="text-sm font-semibold text-[#627D98] uppercase tracking-wide">
          Subscription
        </h2>
        <div className="bg-white rounded-md border border-[#E5E5E5] divide-y divide-[#F5F5F5]">
          <Row label="Plan" value={`${account.plan} — ${account.priceLabel}`} />
          <Row label="Seats" value={String(account.seats)} />
          {account.subscriptionStatus === "trial" && account.trialEnd ? (
            <Row label="Trial ends" value={account.trialEnd} />
          ) : (
            <Row label="Next charge" value={account.nextCharge} />
          )}
          <div className="px-4 py-3">
            {account.subscriptionStatus !== "cancelled" ? (
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                className="text-sm text-[#627D98] underline hover:text-[#DC2626] transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97706] rounded min-h-[44px] flex items-center"
              >
                Cancel subscription
              </button>
            ) : (
              <p className="text-sm text-[#A3A3A3]">
                Subscription cancelled. Access until{" "}
                {new Date(account.periodEnd).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                .
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Log out */}
      <section aria-label="Session" className="pt-2">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="w-full text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          onClick={handleLogout}
          disabled={isLoggingOut}
          aria-busy={isLoggingOut}
        >
          {isLoggingOut ? "Signing out…" : "Log out"}
        </Button>
      </section>

      <CancelSubscriptionDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        periodEnd={account.periodEnd}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between min-h-[44px]">
      <span className="text-sm text-[#627D98]">{label}</span>
      <span className="text-sm font-medium text-[#102A43]">{value}</span>
    </div>
  );
}

function RowLink({ label, href }: { label: string; href: string }) {
  return (
    <Link
      href={href}
      className="px-4 py-3 flex items-center justify-between min-h-[44px] hover:bg-[#FAFAFA] transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D97706]"
    >
      <span className="text-sm text-[#627D98]">{label}</span>
      <span className="text-[#829AB1] text-sm" aria-hidden="true">→</span>
    </Link>
  );
}
