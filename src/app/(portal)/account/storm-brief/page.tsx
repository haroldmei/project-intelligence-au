"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AccountDTO } from "@/modules/account/service";

// Per-user storm-brief opt-out (#20). The feature itself is globally gated
// behind STORM_BRIEF_ENABLED; this toggle lets a user opt out ahead of launch.
// Defaults opted-in (matches the DB default), single POST /api/account/storm-brief.
export default function StormBriefPage() {
  const [enabled, setEnabled] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/me")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as AccountDTO;
      })
      .then((data) => {
        if (cancelled) return;
        setEnabled(Boolean(data.stormBriefOptIn));
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load your storm-brief setting. Refresh to retry.");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleToggle() {
    const next = !enabled;
    // Optimistic update — revert on failure.
    setEnabled(next);
    setIsSaving(true);
    setError(null);
    setSaveError(null);
    try {
      const res = await fetch("/api/account/storm-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optIn: next }),
      });
      if (!res.ok) {
        setEnabled(!next); // revert
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setSaveError(typeof body.error === "string" ? body.error : "Failed to update. Please try again.");
      } else {
        setToast(next ? "Storm briefs on." : "Storm briefs off.");
      }
      setTimeout(() => {
        setToast(null);
        setSaveError(null);
      }, 4000);
    } catch {
      setEnabled(!next);
      setSaveError("Network error. Please try again.");
      setTimeout(() => {
        setToast(null);
        setSaveError(null);
      }, 4000);
    } finally {
      setIsSaving(false);
    }
  }

  const toggleDisabled = !loaded || isSaving;

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
        <h1 className="text-xl font-semibold text-[#102A43]">Storm briefs</h1>
      </div>

      {error && (
        <div role="alert" aria-live="assertive" className="rounded-md bg-[#FEE2E2] text-[#7F1D1D] text-sm px-4 py-3">
          {error}
        </div>
      )}

      <div className="bg-white rounded-md border border-[#E5E5E5] px-4 py-4">
        <div className="flex items-center justify-between min-h-[44px] gap-4">
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-[#102A43]">Mid-week storm brief</p>
            <p className="text-xs text-[#829AB1]">
              A quick email when the Bureau of Meteorology warns of severe storms in your areas
            </p>
          </div>

          {/* Toggle switch */}
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Toggle mid-week storm brief"
            disabled={toggleDisabled}
            onClick={handleToggle}
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 disabled:opacity-50 min-h-[44px] min-w-[44px] justify-center ${
              enabled ? "bg-[#D97706]" : "bg-[#D4D4D4]"
            }`}
          >
            <span
              className={`pointer-events-none block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-[150ms] ${
                enabled ? "translate-x-2.5" : "-translate-x-2.5"
              }`}
              aria-hidden="true"
            />
          </button>
        </div>

        <p className="text-xs text-[#829AB1] mt-3 border-t border-[#F5F5F5] pt-3">
          Storm and hail work is insurance-funded and time-sensitive — this is a heads-up, separate
          from your Sunday digest. Warning data © Bureau of Meteorology.
        </p>
      </div>

      {saveError && (
        <div role="alert" aria-live="assertive" className="rounded-md bg-[#FEE2E2] text-[#7F1D1D] text-sm px-4 py-3">
          {saveError}
        </div>
      )}

      {toast && (
        <div role="status" aria-live="polite" className="text-sm text-[#14532D] bg-[#DCFCE7] rounded-md px-4 py-3">
          {toast}
        </div>
      )}
    </div>
  );
}
