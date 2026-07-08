"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PRICING, PRICE_MONTHLY_INC_GST, TRIAL_LENGTH_LABEL } from "@/lib/pricing";
import { getDigestArrivalString } from "@/lib/digest-arrival";

// Team plan is gated off until the multi-seat flow is built (no team-creation
// UI, no invites, no per-seat digest fan-out). Re-add the team entry below to
// re-enable in the picker.
const PLANS = [
  {
    id: "solo",
    name: PRICING.planName,
    price: PRICE_MONTHLY_INC_GST,
    seats: "1 seat",
    features: "All 15 LGAs",
  },
] as const;

type PlanId = (typeof PLANS)[number]["id"];

export default function PlanPage() {
  const [selectedPlan, setSelectedPlan] = useState<PlanId>("solo");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  async function handleStartTrial() {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? "Failed to start checkout. Please try again.");
        return;
      }
      // Redirect to Stripe Checkout
      window.location.href = json.checkout_url;
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-sm p-6 space-y-5">
      <div className="flex items-center justify-end text-xs text-[#829AB1]">
        <span>Step 5 of 5</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-[#102A43]">Choose your plan</h1>
        <p className="text-sm text-[#627D98] mt-1">
          {TRIAL_LENGTH_LABEL} free trial. Cancel anytime.
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

      <div className="space-y-3" role="radiogroup" aria-label="Choose a plan">
        {PLANS.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          return (
            <button
              key={plan.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelectedPlan(plan.id)}
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
                    "flex-shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center",
                    isSelected
                      ? "border-[#D97706]"
                      : "border-[#D4D4D4]"
                  )}
                  aria-hidden="true"
                >
                  {isSelected && (
                    <span className="h-2.5 w-2.5 rounded-full bg-[#D97706]" />
                  )}
                </span>
                <div>
                  <p className="font-semibold text-[#102A43]">{plan.name}</p>
                  <p className="text-sm text-[#334E68]">{plan.price}</p>
                  <p className="text-xs text-[#829AB1]">
                    {plan.seats} · {plan.features}
                  </p>
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
        onClick={handleStartTrial}
        disabled={isSubmitting}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? "Redirecting to checkout…" : `Start ${TRIAL_LENGTH_LABEL} trial`}
      </Button>

      <div className="text-center text-xs text-[#829AB1] space-y-1">
        <p>Your card is not charged for {PRICING.trialDays} days.</p>
        <p>{getDigestArrivalString()}</p>
      </div>
    </div>
  );
}
