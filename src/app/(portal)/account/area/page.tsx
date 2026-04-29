"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const LGA_BUNDLES = [
  {
    id: "western_sydney",
    label: "Western Sydney",
    lgas: "Penrith · Blacktown · Parramatta · Cumberland · The Hills",
  },
  {
    id: "inner_west",
    label: "Inner West & City",
    lgas: "Inner West · City of Sydney · Strathfield · Burwood",
  },
  {
    id: "northern_sydney",
    label: "Northern Sydney",
    lgas: "Hornsby · Ku-ring-gai · Ryde · Lane Cove · Willoughby",
  },
  {
    id: "southern_sydney",
    label: "Southern Sydney",
    lgas: "Sutherland Shire · St George · Hurstville · Rockdale",
  },
];

export default function MyAreaPage() {
  // TODO: load initial selection from GET /api/account once backend-developer publishes the route.
  const [selected, setSelected] = useState<Set<string>>(
    new Set(["western_sydney"])
  );
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (selected.size === 0) return;
    setError(null);
    setIsSaving(true);
    try {
      const res = await fetch("/api/account/lga-bundles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle_ids: Array.from(selected) }),
      });
      if (!res.ok) {
        const json = await res.json();
        setError(json.error ?? "Failed to save. Please try again.");
        return;
      }
      setToast("Area saved. Takes effect next Sunday.");
      setTimeout(() => setToast(null), 5000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="px-4 py-6 space-y-5 max-w-xl">
      <h1 className="text-2xl font-bold text-[#102A43]">My Service Area</h1>
      <p className="text-sm text-[#627D98]">
        Your digest covers these LGA bundles:
      </p>

      {error && (
        <div role="alert" aria-live="assertive" className="rounded-md bg-[#FEE2E2] text-[#7F1D1D] text-sm px-4 py-3">
          {error}
        </div>
      )}

      <div className="space-y-3" role="group" aria-label="LGA bundle selection">
        {LGA_BUNDLES.map((bundle) => {
          const isSelected = selected.has(bundle.id);
          return (
            <button
              key={bundle.id}
              type="button"
              onClick={() => toggle(bundle.id)}
              aria-pressed={isSelected}
              className={cn(
                "w-full text-left rounded-md border p-4 min-h-[44px] transition-all duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-1",
                isSelected
                  ? "border-[#D97706] border-l-4 bg-[#FFFBEB]"
                  : "border-[#E5E5E5] hover:border-[#D4DDE8]"
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "flex-shrink-0 h-5 w-5 rounded border-2 flex items-center justify-center text-xs font-bold",
                    isSelected
                      ? "bg-[#D97706] border-[#D97706] text-white"
                      : "border-[#D4D4D4] bg-white"
                  )}
                  aria-hidden="true"
                >
                  {isSelected ? "✓" : ""}
                </span>
                <div>
                  <p className="font-semibold text-[#102A43] text-sm">
                    {bundle.label}
                  </p>
                  <p className="text-xs text-[#829AB1] mt-0.5">{bundle.lgas}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-[#829AB1]">
        Changes apply from next Sunday&apos;s digest.
      </p>

      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full md:w-auto"
        onClick={handleSave}
        disabled={selected.size === 0 || isSaving}
        aria-busy={isSaving}
      >
        {isSaving ? "Saving…" : "Save area"}
      </Button>

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
