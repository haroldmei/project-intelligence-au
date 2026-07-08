// Lapsed-trial prompt — shown on /digest when a self-signup trial user's
// entitlement window has closed (issue #236). Mirrors the FinishSetupPrompt
// pattern (issue #123) but with a re-subscribe CTA instead of a setup CTA.
//
// The goal is to give a lapsed user a clear, one-tap path back to the paid
// product instead of leaving them staring at a stale digest or the false
// "Your first digest arrives Sunday" EmptyState copy (which is now a lie).
import Link from "next/link";

export function LapsedTrialPrompt() {
  return (
    <div className="px-4 py-8 space-y-4">
      <h1 className="text-2xl font-bold text-[#102A43]">Your Digest</h1>
      <div
        className="rounded-md bg-[#FEF3C7] text-[#78350F] text-sm px-4 py-4"
        role="note"
      >
        <p className="font-medium">Your trial has ended.</p>
        <p className="mt-1">
          Your 28-day free trial has expired, and DA lead delivery has been
          paused. Subscribe to keep your Sunday digest arriving every week.
        </p>
        <Link
          href="/plan"
          className="mt-3 inline-block rounded-md bg-[#78350F] text-white text-sm font-medium px-4 py-2"
        >
          Subscribe to keep your Sunday digest
        </Link>
      </div>
    </div>
  );
}
