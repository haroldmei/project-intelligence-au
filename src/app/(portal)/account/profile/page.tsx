"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AccountDTO } from "@/modules/account/service";

export default function ProfilePage() {
  const [account, setAccount] = useState<AccountDTO | null>(null);
  const [mobile, setMobile] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/me")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as AccountDTO;
      })
      .then((data) => {
        if (cancelled) return;
        setAccount(data);
        setMobile(data.mobile_e164 ?? "");
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load your profile. Refresh to retry.");
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  function normalise(input: string): string {
    return input.replace(/\s+/g, "");
  }

  function isValidE164(input: string): boolean {
    return /^\+[1-9]\d{6,14}$/.test(input);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);

    const next = normalise(mobile);
    if (next && !isValidE164(next)) {
      setValidationError("Must be E.164 format, e.g. +61432346630");
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/account/me", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Send `null` (not undefined) when cleared so the backend removes the
        // number instead of treating an empty submit as "no change" (#166).
        body: JSON.stringify({ mobile_e164: next || null }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        const msg = typeof body.error === "string" ? body.error : "Save failed. Please try again.";
        setToast(msg);
      } else {
        const updated = (await res.json()) as AccountDTO;
        setAccount(updated);
        setMobile(updated.mobile_e164 ?? "");
        setToast("Saved.");
      }
    } catch {
      setToast("Network error. Please try again.");
    } finally {
      setIsSaving(false);
      setTimeout(() => setToast(null), 4000);
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
        <h1 className="text-xl font-semibold text-[#102A43]">Profile</h1>
      </div>

      {error && (
        <div role="alert" aria-live="assertive" className="rounded-md bg-[#FEE2E2] text-[#7F1D1D] text-sm px-4 py-3">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white rounded-md border border-[#E5E5E5] px-4 py-4 space-y-4">
        <div className="space-y-1">
          <label className="block text-sm font-semibold text-[#102A43]">Email</label>
          <p className="text-sm text-[#334E68]">{account?.email ?? "—"}</p>
          <p className="text-xs text-[#829AB1]">Email changes aren&apos;t supported yet — contact support.</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="mobile" className="block text-sm font-semibold text-[#102A43]">
            Mobile number
          </label>
          <input
            id="mobile"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+61432346630"
            disabled={!loaded || isSaving}
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            className="w-full min-h-[44px] rounded-md border border-[#D4D4D4] px-3 py-2 text-sm text-[#102A43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] disabled:opacity-50"
            aria-invalid={validationError ? true : undefined}
            aria-describedby={validationError ? "mobile-error" : "mobile-hint"}
          />
          {validationError ? (
            <p id="mobile-error" className="text-xs text-[#7F1D1D]">{validationError}</p>
          ) : (
            <p id="mobile-hint" className="text-xs text-[#829AB1]">
              E.164 format (start with + and country code). Required for SMS digest.
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={!loaded || isSaving}
          className="inline-flex items-center justify-center font-semibold rounded-md transition-all duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 active:scale-95 bg-[#D97706] text-white hover:bg-[#B45309] min-h-[44px] h-12 px-6 text-base disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </form>

      {toast && (
        <div role="status" aria-live="polite" className="text-sm text-[#14532D] bg-[#DCFCE7] rounded-md px-4 py-3">
          {toast}
        </div>
      )}
    </div>
  );
}
