"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CancelSubscriptionDialog } from "@/components/cancel-subscription-dialog";
import { Button } from "@/components/ui/button";
import type { AccountDTO } from "@/modules/account/service";
import { SOLO_PLAN_LABEL } from "@/lib/pricing";

// Solo is the only plan — multi-seat ("Team") is deferred until it ships, so
// every current subscription maps to the single Solo label/seat count.
const PLAN_LABELS: Record<string, string> = {
  solo: SOLO_PLAN_LABEL,
};
const PLAN_SEATS: Record<string, number> = { solo: 1 };

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function AccountPage() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [isResubLoading, setIsResubLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/me")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as AccountDTO;
      })
      .then((data) => { if (!cancelled) setAccount(data); })
      .catch(() => { if (!cancelled) setLoadError("Couldn't load your account. Refresh to try again."); });
    return () => { cancelled = true; };
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* best-effort */
    }
    router.push("/login");
  }

  async function handleManageBilling() {
    setIsPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.portal_url) throw new Error("portal failed");
      window.location.href = json.portal_url;
    } catch {
      setIsPortalLoading(false);
    }
  }

  async function handleResubscribe(plan: "solo" | "team") {
    setIsResubLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json();
      if (!res.ok || !json.checkout_url) throw new Error("checkout failed");
      window.location.href = json.checkout_url;
    } catch {
      setIsResubLoading(false);
    }
  }

  if (loadError) {
    return (
      <div className="px-4 py-6 max-w-xl">
        <div role="alert" className="rounded-md bg-[#FEE2E2] text-[#7F1D1D] text-sm px-4 py-3">
          {loadError}
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="px-4 py-6 max-w-xl text-sm text-[#627D98]">Loading account…</div>
    );
  }

  const plan = account.plan ?? "solo";
  const priceLabel = PLAN_LABELS[plan] ?? "—";
  const seats = PLAN_SEATS[plan] ?? 1;
  const status = account.subscriptionStatus;
  const isCancelled = status === "cancelled";
  const isPendingCancellation = !isCancelled && account.cancelAtPeriodEnd;
  const isTrial = status === "trial";
  const isPastDue = status === "past_due";
  // The DB sets status="trial" at signup, before Stripe Checkout has run.
  // accessUntil is only populated by the subscription.created webhook, so it's
  // the reliable signal that a Stripe subscription actually exists.
  const hasStripeSubscription = account.accessUntil != null;
  const needsCheckout = !isCancelled && !hasStripeSubscription;

  return (
    <div className="px-4 py-6 space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold text-[#102A43]">Account</h1>

      <section aria-label="Profile" className="space-y-2">
        <h2 className="text-sm font-semibold text-[#627D98] uppercase tracking-wide">Profile</h2>
        <div className="bg-white rounded-md border border-[#E5E5E5] divide-y divide-[#F5F5F5]">
          <Row label="Email" value={account.email} />
          <RowLink
            label="Mobile"
            href="/account/profile"
            value={account.mobile_e164 ?? "Add a number"}
          />
          <RowLink
            label="Search query"
            href="/account/saved-query"
            value={account.savedQueryText ? "Edit" : "Add a description"}
          />
          <RowLink label="Notifications" href="/account/sms" />
          <RowLink label="Storm briefs" href="/account/storm-brief" />
          <RowLink label="My Service Area" href="/account/area" />
        </div>
      </section>

      <section aria-label="Subscription" className="space-y-2">
        <h2 className="text-sm font-semibold text-[#627D98] uppercase tracking-wide">Subscription</h2>
        <div className="bg-white rounded-md border border-[#E5E5E5] divide-y divide-[#F5F5F5]">
          <Row label="Plan" value={priceLabel} />
          <Row label="Seats" value={String(seats)} />

          {needsCheckout ? (
            <Row label="Status" value="Trial not started" />
          ) : isTrial ? (
            <Row label="Trial ends" value={formatDate(account.accessUntil)} />
          ) : isPendingCancellation || isCancelled ? (
            <Row label="Access until" value={formatDate(account.accessUntil)} />
          ) : isPastDue ? (
            <Row label="Status" value="Payment failed — update card" />
          ) : (
            <Row label="Next charge" value={formatDate(account.accessUntil)} />
          )}

          <div className="px-4 py-3 space-y-2">
            {needsCheckout ? (
              <>
                <p className="text-sm text-[#627D98]">
                  Pick a plan to start your 28-day trial. Your card isn&apos;t charged until day 29.
                </p>
                <Link
                  href="/plan"
                  className="inline-flex items-center justify-center font-semibold rounded-md transition-all duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 active:scale-95 bg-[#D97706] text-white hover:bg-[#B45309] min-h-[44px] h-12 px-6 text-base w-full"
                >
                  Choose a plan
                </Link>
              </>
            ) : isCancelled ? (
              <>
                <p className="text-sm text-[#A3A3A3]">
                  Subscription cancelled. Access ended {formatDate(account.accessUntil)}.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={() => handleResubscribe("solo")}
                  disabled={isResubLoading}
                  aria-busy={isResubLoading}
                >
                  {isResubLoading ? "Redirecting…" : "Resubscribe"}
                </Button>
              </>
            ) : isPendingCancellation ? (
              <p className="text-sm text-[#A3A3A3]">
                Cancellation scheduled. You&apos;re good until {formatDate(account.accessUntil)}.
              </p>
            ) : (
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                className="text-sm text-[#627D98] underline hover:text-[#DC2626] transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97706] rounded min-h-[44px] flex items-center"
              >
                Cancel subscription
              </button>
            )}

            {!needsCheckout && (
              <button
                type="button"
                onClick={handleManageBilling}
                disabled={isPortalLoading}
                aria-busy={isPortalLoading}
                className="text-sm text-[#627D98] underline hover:text-[#102A43] transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97706] rounded min-h-[44px] flex items-center disabled:opacity-50"
              >
                {isPortalLoading ? "Opening Stripe…" : "Manage billing (update card, invoices)"}
              </button>
            )}
          </div>
        </div>
      </section>

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
        periodEnd={account.accessUntil ?? new Date().toISOString()}
        onCancelled={(newAccessUntil) => {
          setAccount((prev) => prev ? { ...prev, cancelAtPeriodEnd: true, accessUntil: newAccessUntil } : prev);
        }}
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

function RowLink({ label, href, value }: { label: string; href: string; value?: string }) {
  return (
    <Link
      href={href}
      className="px-4 py-3 flex items-center justify-between min-h-[44px] hover:bg-[#FAFAFA] transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D97706]"
    >
      <span className="text-sm text-[#627D98]">{label}</span>
      <span className="flex items-center gap-2 max-w-[60%]">
        {value && (
          <span className="text-sm text-[#102A43] truncate" title={value}>
            {value}
          </span>
        )}
        <span className="text-[#829AB1] text-sm flex-shrink-0" aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
