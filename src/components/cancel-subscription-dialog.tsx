"use client";

import { useState } from "react";
import { AlertDialog } from "@/components/ui/alert-dialog";

interface CancelSubscriptionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ISO date string of period end */
  periodEnd: string;
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

export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  periodEnd,
}: CancelSubscriptionDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function handleConfirm() {
    setIsLoading(true);
    try {
      const res = await fetch("/api/billing/subscription", {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Request failed");
      onOpenChange(false);
      setToast(`Cancelled. You're good until ${formatDate(periodEnd)}.`);
      setTimeout(() => setToast(null), 8000);
    } catch {
      setToast("Something went wrong. Please try again.");
      setTimeout(() => setToast(null), 5000);
    } finally {
      setIsLoading(false);
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
          className="fixed bottom-20 left-4 right-4 md:left-auto md:right-6 md:w-96 z-50 bg-[#102A43] text-white rounded-lg px-4 py-3 shadow-md text-sm"
        >
          {toast}
        </div>
      )}
    </>
  );
}
