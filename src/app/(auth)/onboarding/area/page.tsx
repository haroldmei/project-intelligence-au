"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LGA_BUNDLES = [
  {
    id: "western_sydney",
    label: "Western Sydney",
    lgas: "Penrith · Blacktown · Parramatta · Cumberland · The Hills",
  },
  {
    id: "inner_west_and_city",
    label: "Inner West & City",
    lgas: "Inner West · City of Sydney · Burwood · Canada Bay",
  },
  {
    id: "northern_sydney",
    label: "Northern Sydney",
    lgas: "Hornsby · Ku-ring-gai · Northern Beaches",
  },
  {
    id: "southern_sydney",
    label: "Southern Sydney",
    lgas: "Sutherland · Bayside · Georges River",
  },
];

export default function AreaPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleContinue() {
    if (selected.size === 0) return;
    setServerError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/account/lga-bundles", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bundle_ids: Array.from(selected) }),
      });
      if (!res.ok) {
        const json = await res.json();
        setServerError(json.error ?? "Failed to save area. Please try again.");
        return;
      }
      router.push("/onboarding/query");
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-sm p-6 space-y-5">
      <div className="flex items-center justify-end text-xs text-[#829AB1]">
        <span>Step 3 of 5</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-[#102A43]">
          Choose your service area
        </h1>
        <p className="text-sm text-[#627D98] mt-1">
          Pick the LGA bundles you work in. You can change this anytime.
        </p>
        {/* Out-of-scope escape hatch (issue #25): a user who works outside
            Greater Sydney has no bundle to pick — send them to the waitlist. */}
        <p className="text-sm text-[#627D98] mt-2">
          Work outside Greater Sydney?{" "}
          <Link
            href="/#waitlist"
            className="font-semibold text-[#B45309] underline underline-offset-2 hover:text-[#92400E] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] rounded"
          >
            Join the waitlist
          </Link>
          .
        </p>
      </div>

      {serverError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-[#FEE2E2] text-[#7F1D1D] text-sm px-4 py-3"
        >
          {serverError}
        </div>
      )}

      <div
        className="space-y-3"
        role="group"
        aria-label="LGA bundle selection"
      >
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
                    "flex-shrink-0 h-5 w-5 rounded border text-white flex items-center justify-center text-xs font-bold",
                    isSelected
                      ? "bg-[#D97706] border-[#D97706]"
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

      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full"
        onClick={handleContinue}
        disabled={selected.size === 0 || isSubmitting}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? "Saving…" : "Continue"}
      </Button>
    </div>
  );
}
