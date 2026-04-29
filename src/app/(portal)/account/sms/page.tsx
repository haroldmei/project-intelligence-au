"use client";

import { useState } from "react";
import Link from "next/link";

// TODO: load real sms_opt_in + mobile from GET /api/account once backend-developer publishes the route.
export default function SMSOptInPage() {
  const [smsEnabled, setSmsEnabled] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function handleToggle() {
    const next = !smsEnabled;
    setSmsEnabled(next);
    setIsSaving(true);
    try {
      const res = await fetch("/api/account/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sms_opt_in: next }),
      });
      if (!res.ok) {
        setSmsEnabled(!next); // revert
        setToast("Failed to update. Please try again.");
      } else {
        setToast(next ? "SMS enabled." : "SMS disabled.");
      }
      setTimeout(() => setToast(null), 4000);
    } catch {
      setSmsEnabled(!next);
      setToast("Network error. Please try again.");
      setTimeout(() => setToast(null), 4000);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="px-4 py-6 space-y-6 max-w-xl">
      <div className="flex items-center gap-2">
        <Link
          href="/account"
          aria-label="Back to account settings"
          className="text-[#627D98] hover:text-[#1E3A5F] min-h-[44px] flex items-center pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] rounded"
        >
          ← Account
        </Link>
        <h1 className="text-xl font-semibold text-[#102A43]">Notifications</h1>
      </div>

      <div className="bg-white rounded-md border border-[#E5E5E5] px-4 py-4">
        <div className="flex items-center justify-between min-h-[44px] gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-[#102A43]">
              Sunday SMS digest
            </p>
            <p className="text-xs text-[#829AB1]">
              Top 3 leads via SMS at 6 pm AEST
            </p>
          </div>

          {/* Toggle switch */}
          <button
            type="button"
            role="switch"
            aria-checked={smsEnabled}
            aria-label="Toggle Sunday SMS digest"
            disabled={isSaving}
            onClick={handleToggle}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 disabled:opacity-50 min-h-[44px] min-w-[44px] justify-center ${
              smsEnabled ? "bg-[#D97706]" : "bg-[#D4D4D4]"
            }`}
          >
            <span
              className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-[150ms] ${
                smsEnabled ? "translate-x-2.5" : "-translate-x-2.5"
              }`}
              aria-hidden="true"
            />
          </button>
        </div>

        <p className="text-xs text-[#829AB1] mt-3 border-t border-[#F5F5F5] pt-3">
          Reply STOP to any SMS to opt out immediately.
        </p>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="text-sm text-[#14532D] bg-[#DCFCE7] rounded-md px-4 py-3"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
