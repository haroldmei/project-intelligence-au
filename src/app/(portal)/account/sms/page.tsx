"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AccountDTO } from "@/modules/account/service";

export default function SMSOptInPage() {
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [hasMobile, setHasMobile] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load real state from the API. Without this, the toggle defaulted to
  // "on" regardless of the actual user state and writes blew up because
  // /api/account/notifications doesn't exist (real routes:
  // /api/account/sms-opt-{in,out}).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/me")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as AccountDTO;
      })
      .then((data) => {
        if (cancelled) return;
        setSmsEnabled(Boolean(data.smsOptIn));
        setHasMobile(Boolean(data.mobile_e164));
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load your notification settings. Refresh to retry.");
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  async function handleToggle() {
    const next = !smsEnabled;
    // Optimistic update — revert on failure.
    setSmsEnabled(next);
    setIsSaving(true);
    setError(null);
    try {
      const endpoint = next ? "/api/account/sms-opt-in" : "/api/account/sms-opt-out";
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) {
        setSmsEnabled(!next); // revert
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setToast(body.error || "Failed to update. Please try again.");
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

  const toggleDisabled = !loaded || isSaving || (!smsEnabled && !hasMobile);

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

      {error && (
        <div role="alert" aria-live="assertive" className="rounded-md bg-[#FEE2E2] text-[#7F1D1D] text-sm px-4 py-3">
          {error}
        </div>
      )}

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
            disabled={toggleDisabled}
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

        {loaded && !hasMobile && !smsEnabled && (
          <div className="text-xs text-[#7F1D1D] mt-3 border-t border-[#F5F5F5] pt-3">
            <p>Add a mobile number first — your account doesn&apos;t have one yet.</p>
            <Link
              href="/account/profile"
              className="inline-flex items-center min-h-[44px] font-semibold text-[#B45309] hover:text-[#92400E] underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] rounded"
            >
              Add your mobile number →
            </Link>
          </div>
        )}

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
