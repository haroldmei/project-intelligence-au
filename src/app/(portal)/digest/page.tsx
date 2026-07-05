import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DigestView } from "@/components/digest-view";
import { validateRequest } from "@/lib/auth/session";
import { PATHNAME_HEADER, buildLoginRedirect } from "@/lib/auth/return-to";
import {
  getCurrentDigest,
  getDigestHistory,
  getMyArea,
  type MyArea,
} from "@/modules/portal/loaders";

export const metadata: Metadata = {
  title: "Your Digest — ProjectIntelligence AU",
};
export const dynamic = "force-dynamic";

function buildAreaLabel(area: MyArea | null): string {
  if (!area || area.lgaBundles.length === 0) return "—";
  return area.lgaBundles.map((b) => b.label).join(" + ");
}

export default async function DigestPage({
  searchParams,
}: {
  searchParams: Promise<{ feedback?: string }>;
}) {
  const auth = await validateRequest();
  if (!auth) {
    // Defence in depth behind the layout gate — preserve returnTo (issue #137).
    const target = (await headers()).get(PATHNAME_HEADER);
    redirect(buildLoginRedirect(target));
  }

  const { feedback } = await searchParams;
  const showFeedbackToast = feedback === "recorded";

  const [digest, area, history] = await Promise.all([
    getCurrentDigest(auth.user.id),
    getMyArea(auth.user.id),
    getDigestHistory(auth.user.id, 100),
  ]);

  if (!digest) {
    return (
      <>
        {showFeedbackToast && <FeedbackToast />}
        <EmptyState />
      </>
    );
  }

  return (
    <>
      {showFeedbackToast && <FeedbackToast />}
      <DigestView
        digest={digest}
        // Show the area this digest was sent under, not the user's current area
        // if it changed since (issue #138); fall back to live for legacy digests.
        areaLabel={digest.areaLabel ?? buildAreaLabel(area)}
        weeksOfHistory={history.filter((h) => h.sentAt).length}
      />
    </>
  );
}

function FeedbackToast() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mx-4 mt-4 rounded-md bg-[#DCFCE7] text-[#14532D] text-sm px-4 py-3"
    >
      Thanks — your feedback was recorded. Your digest gets smarter every week.
    </div>
  );
}

function EmptyState() {
  return (
    <div className="px-4 py-8 space-y-4">
      <h1 className="text-2xl font-bold text-[#102A43]">Your Digest</h1>
      <div className="rounded-md bg-[#E0F2FE] text-[#0C4A6E] text-sm px-4 py-4">
        <p className="font-medium">Your first digest arrives Sunday at 6 pm AEST.</p>
        <p className="mt-1 text-xs">
          We send the week&apos;s DA leads every Sunday evening. Once it arrives,
          it will appear here.
        </p>
      </div>
      <div className="rounded-md bg-[#FEF3C7] text-[#78350F] text-sm px-4 py-4" role="note">
        Your digest gets smarter as you use it — tap 👍 or 👎 on each card.
      </div>
    </div>
  );
}
