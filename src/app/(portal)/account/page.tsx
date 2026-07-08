"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CancelSubscriptionDialog } from "@/components/cancel-subscription-dialog";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";
import { Button } from "@/components/ui/button";
import type { AccountDTO } from "@/modules/account/service";
import { PRICE_MONTHLY_INC_GST, SOLO_PLAN_LABEL } from "@/lib/pricing";

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

// After Stripe Checkout the subscription is provisioned asynchronously by the
// customer.subscription.created webhook, which populates User.accessUntil. That
// webhook is not synchronous with the redirect, so a just-paid user landing on
// /account?billing=success can arrive before it lands. Poll /api/account/me a
// few times so the page flips to the trial state on its own instead of
// stranding them on "Trial not started" (issue #133).
const POLL_INTERVAL_MS = 2500;
const MAX_POLL_ATTEMPTS = 8; // ~20s — long enough for the webhook, short enough to give up gracefully

export default function AccountPage() {
  const router = useRouter();
  const [account, setAccount] = useState<AccountDTO | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isPortalLoading, setIsPortalLoading] = useState(false);
  const [isResubLoading, setIsResubLoading] = useState(false);
  const [isResumeLoading, setIsResumeLoading] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);
  // Set from the ?billing hint Stripe Checkout appends to its success/cancel URLs.
  const [justCheckedOut, setJustCheckedOut] = useState(false);
  const [checkoutCancelled, setCheckoutCancelled] = useState(false);
  const [provisioningTimedOut, setProvisioningTimedOut] = useState(false);

  useEffect(() => {
    // Read the ?billing hint client-side (window.location) to avoid a
    // useSearchParams Suspense boundary — same pattern the login page uses for
    // ?returnTo. Stripe's success_url is /account?billing=success (checkout route).
    const billing = new URLSearchParams(window.location.search).get("billing");
    const paidJustNow = billing === "success";
    setJustCheckedOut(paidJustNow);
    setCheckoutCancelled(billing === "cancelled");

    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function load(): Promise<void> {
      try {
        const res = await fetch("/api/account/me");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AccountDTO;
        if (cancelled) return;
        setAccount(data);

        // Keep polling while a just-paid user is still waiting on the
        // provisioning webhook. Two shapes of "not provisioned yet":
        //  - first-time trialer: accessUntil not yet populated by the webhook;
        //  - re-subscriber: still status=cancelled (the cancel webhook keeps a
        //    stale non-null accessUntil, so accessUntil==null never fires here)
        //    until subscription.created flips status back to active (#197).
        const stillProvisioning =
          paidJustNow && (data.accessUntil == null || data.subscriptionStatus === "cancelled");
        if (stillProvisioning) {
          if (attempts < MAX_POLL_ATTEMPTS) {
            attempts += 1;
            timer = setTimeout(load, POLL_INTERVAL_MS);
          } else {
            setProvisioningTimedOut(true);
          }
        }
      } catch {
        if (!cancelled) setLoadError("Couldn't load your account. Refresh to try again.");
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
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

  async function handleResume() {
    setIsResumeLoading(true);
    setResumeError(null);
    try {
      const res = await fetch("/api/billing/subscription", { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { accessUntil?: string };
      if (!res.ok) throw new Error("resume failed");
      setAccount((prev) =>
        prev
          ? { ...prev, cancelAtPeriodEnd: false, accessUntil: json.accessUntil ?? prev.accessUntil }
          : prev,
      );
    } catch {
      setResumeError("Couldn't resume your subscription. Please try again.");
    } finally {
      setIsResumeLoading(false);
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
  // A cancelled user who just completed re-subscribe checkout. The cancel
  // webhook deliberately preserves a stale non-null accessUntil, and the
  // subscription.created webhook hasn't flipped status back to active yet — so
  // the account is momentarily still "cancelled" with old data. Treat this as
  // provisioning too, otherwise the page renders the "Payment received" banner
  // alongside the contradictory "Subscription cancelled · Access ended" +
  // Resubscribe block, and never re-polls to self-heal (issue #197).
  const isResubscribing = justCheckedOut && isCancelled;
  // Just paid, but the provisioning webhook hasn't caught up yet: either a
  // first-time trialer (accessUntil not populated) or a re-subscriber (status
  // still cancelled). Show one coherent "activating" state + success
  // confirmation instead of the pre-checkout dead-end or the stale cancelled
  // block (issues #133, #197).
  const isProvisioning = justCheckedOut && (needsCheckout || isResubscribing);

  return (
    <div className="px-4 py-6 space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold text-[#102A43]">Account</h1>

      {justCheckedOut && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md bg-[#DCFCE7] text-[#14532D] text-sm px-4 py-3"
        >
          <p className="font-semibold">Payment received — you&apos;re all set.</p>
          {isProvisioning ? (
            provisioningTimedOut ? (
              <p className="mt-1">
                Your {isResubscribing ? "subscription" : "trial"} is taking a
                little longer than usual to activate. Refresh in a moment — or
                contact support if it doesn&apos;t appear.
              </p>
            ) : (
              <p className="mt-1">
                {isResubscribing
                  ? "We're reactivating your subscription now"
                  : "We're activating your 28-day trial now"}{" "}
                — this page updates automatically in a few seconds.
              </p>
            )
          ) : (
            <p className="mt-1">
              {isTrial
                ? "Your 28-day trial is active. Your first Sunday digest is on the way."
                : "Your subscription is active. Your next Sunday digest is on the way."}
            </p>
          )}
        </div>
      )}

      {checkoutCancelled && !justCheckedOut && (
        <div
          role="status"
          className="rounded-md bg-[#F1F5F9] text-[#334E68] text-sm px-4 py-3"
        >
          Checkout wasn&apos;t completed and you weren&apos;t charged. Pick a plan
          below whenever you&apos;re ready.
        </div>
      )}

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

          {isProvisioning ? (
            <Row
              label="Status"
              value={isResubscribing ? "Reactivating your subscription…" : "Activating your trial…"}
            />
          ) : needsCheckout ? (
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
            {isProvisioning ? (
              <p className="text-sm text-[#627D98]" aria-live="polite">
                {isResubscribing
                  ? "We're reactivating your subscription now"
                  : "We're setting up your trial now"}{" "}
                — nothing more to do; this page updates on its own.
              </p>
            ) : needsCheckout ? (
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
              <>
                <p className="text-sm text-[#A3A3A3]">
                  Cancellation scheduled. You&apos;re good until {formatDate(account.accessUntil)}.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={handleResume}
                  disabled={isResumeLoading}
                  aria-busy={isResumeLoading}
                >
                  {isResumeLoading ? "Resuming…" : "Resume subscription"}
                </Button>
                {resumeError && (
                  <p role="alert" className="text-sm text-[#DC2626]">
                    {resumeError}
                  </p>
                )}
              </>
            ) : isTrial ? (
              <>
                <p className="text-sm text-[#627D98]">
                  Your card is charged {PRICE_MONTHLY_INC_GST} on{" "}
                  {formatDate(account.accessUntil)} unless you cancel before
                  then.
                </p>
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  className="text-sm text-[#627D98] underline hover:text-[#DC2626] transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97706] rounded min-h-[44px] flex items-center"
                >
                  Cancel subscription
                </button>
              </>
            ) : isPastDue ? (
              <>
                <p className="text-sm text-[#7C2D12]">
                  Your last payment didn&apos;t go through. Update your card to
                  keep your Sunday digest — access resumes as soon as it clears.
                </p>
                <Button
                  type="button"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={handleManageBilling}
                  disabled={isPortalLoading}
                  aria-busy={isPortalLoading}
                >
                  {isPortalLoading ? "Opening Stripe…" : "Update your card"}
                </Button>
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  className="text-sm text-[#627D98] underline hover:text-[#DC2626] transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97706] rounded min-h-[44px] flex items-center"
                >
                  Cancel subscription
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setCancelOpen(true)}
                className="text-sm text-[#627D98] underline hover:text-[#DC2626] transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97706] rounded min-h-[44px] flex items-center"
              >
                Cancel subscription
              </button>
            )}

            {!needsCheckout && !isPastDue && !isProvisioning && (
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

      <section aria-label="Data and privacy" className="space-y-2">
        <h2 className="text-sm font-semibold text-[#627D98] uppercase tracking-wide">Data &amp; privacy</h2>
        <div className="bg-white rounded-md border border-[#E5E5E5] divide-y divide-[#F5F5F5]">
          {/* Privacy Act export — the policy promises this exact control. A GET
              with a Content-Disposition attachment header, so a plain link
              downloads the JSON (the auth cookie rides along same-origin). */}
          <a
            href="/api/account/export"
            className="px-4 py-3 flex items-center justify-between min-h-[44px] hover:bg-[#FAFAFA] transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D97706]"
          >
            <span className="text-sm text-[#627D98]">Download my data</span>
            <span className="text-[#829AB1] text-sm flex-shrink-0" aria-hidden="true">↓</span>
          </a>
          <div className="px-4 py-3">
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="text-sm text-[#627D98] underline hover:text-[#DC2626] transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DC2626] rounded min-h-[44px] flex items-center"
            >
              Delete account
            </button>
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
        onReactivated={(newAccessUntil) => {
          setAccount((prev) => prev ? { ...prev, cancelAtPeriodEnd: false, accessUntil: newAccessUntil } : prev);
        }}
      />

      <DeleteAccountDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        onDeleted={() => {
          // The DELETE handler already cleared the session cookie; send the
          // (now anonymous) user to login.
          router.push("/login");
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
