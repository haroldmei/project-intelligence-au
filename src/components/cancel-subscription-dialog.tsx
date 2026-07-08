"use client";

import { useState } from "react";
import { AlertDialog } from "@/components/ui/alert-dialog";

interface CancelSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ISO date string of period end (current best-known value, before the API confirms) */
  periodEnd: string;
  /** Called with the canonical ISO accessUntil returned by the cancel API. */
  onCancelled?: (accessUntil: string) => void;
  /**
   * Called with the canonical ISO accessUntil after the toast [Undo] action
   * reactivates the subscription (design §7.10b). Lets the account page clear
   * its pending-cancellation state without a reload.
   */
  onReactivated?: (accessUntil: string) => void;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Closed set of churn reason codes — must match CANCELLATION_REASONS in
// src/app/api/billing/subscription/route.ts. The value is persisted + sent to
// analytics, so it's a fixed enum (no free-text PII). Collecting it is the
// cheapest churn instrument the product has (issue #96 A5); it stays optional.
const CANCELLATION_REASONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_enough_leads", label: "Not enough leads" },
  { value: "leads_not_relevant", label: "Leads weren't relevant" },
  { value: "found_another_tool", label: "Found another tool" },
  { value: "other", label: "Other" },
];

/** A toast that may carry a single inline action (e.g. [Undo]). */
interface ToastState {
  message: string;
  /** When set, the toast shows this action; used for the post-cancel [Undo]. */
  action?: { label: string; onClick: () => void };
}

export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  periodEnd,
  onCancelled,
  onReactivated,
}: CancelSubscriptionDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isUndoing, setIsUndoing] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [reason, setReason] = useState("");

  async function handleConfirm() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "DELETE",
        // Reason is optional — only send a body when the user picked one.
        ...(reason
          ? {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reason }),
            }
          : {}),
      });
      if (!res.ok) throw new Error("Request failed");
      const json = (await res.json().catch(() => ({}))) as { accessUntil?: string };
      const confirmedUntil = json.accessUntil ?? periodEnd;
      onCancelled?.(confirmedUntil);
      onOpenChange(false);
      setToast({
        message: `Cancelled. You're good until ${formatDate(confirmedUntil)}.`,
        action: { label: "Undo", onClick: handleUndo },
      });
      // Toast persists 8s so the [Undo] window matches design §7.10b.
      setTimeout(() => setToast(null), 8000);
    } catch {
      setToast({ message: "Something went wrong. Please try again." });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleUndo() {
    setIsUndoing(true);
    try {
      const res = await fetch("/api/billing/subscription", { method: "POST" });
      if (!res.ok) throw new Error("Request failed");
      const json = (await res.json().catch(() => ({}))) as { accessUntil?: string };
      const confirmedUntil = json.accessUntil ?? periodEnd;
      onReactivated?.(confirmedUntil);
      setToast({ message: "Subscription resumed. You're all set." });
      setTimeout(() => setToast(null), 5000);
    } catch {
      setToast({ message: "Couldn't resume. Try again from your account." });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setIsUndoing(false);
    }
  }

  return (
    <>
      <AlertDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Cancel your subscription?"
        description={
          <>
            <p>
              You&apos;ll keep digest access until{" "}
              <strong>{formatDate(periodEnd)}</strong>.
            </p>
            <p className="mt-2">
              Your saved LGAs and feedback history stay for 90 days, then we
              delete them.
            </p>
            <div className="mt-4">
              <label
                htmlFor="cancel-reason"
                className="block text-sm text-[#627D98] mb-1"
              >
                Mind telling us why? (optional)
              </label>
              <select
                id="cancel-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={isLoading}
                className="w-full rounded-md border border-[#CBD2D9] px-3 py-2 text-sm text-[#102A43] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] disabled:opacity-50"
              >
                <option value="">Prefer not to say</option>
                {CANCELLATION_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </>
        }
        confirmLabel="Cancel subscription"
        cancelLabel="Keep my plan"
        onConfirm={handleConfirm}
        confirmVariant="destructive"
        isLoading={isLoading}
      />

      {toast && (
        <div
          role="alert"
          aria-live="assertive"
          className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 bg-[#102A43] text-white rounded-lg px-4 py-3 shadow-md text-sm flex items-center justify-between gap-3"
        >
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={toast.action.onClick}
              disabled={isUndoing}
              aria-busy={isUndoing}
              className="flex-shrink-0 font-semibold text-[#FBBF24] underline underline-offset-2 hover:text-[#FCD34D] transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBBF24] rounded disabled:opacity-60 min-h-[44px] px-1"
            >
              {isUndoing ? "Resuming…" : toast.action.label}
            </button>
          )}
        </div>
      )}
    </>
  );
}
