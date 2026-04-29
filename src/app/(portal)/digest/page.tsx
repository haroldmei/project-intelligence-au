import type { Metadata } from "next";
import { DigestHeader } from "@/components/digest-header";
import { DACard } from "@/components/da-card";

export const metadata: Metadata = {
  title: "Your Digest — ProjectIntelligence AU",
};

// Stub DA type — replace with Prisma model once backend-developer publishes DigestDetail
interface StubDA {
  id: string;
  address: string;
  lga: string;
  relevanceScore: number;
  estimatedValue: number | null;
  whyMatched: string;
  scopeText: string;
  applicantName: string | null;
  portalUrl: string;
}

// TODO: fetch from GET /api/digests/current once backend-developer publishes the route.
// For now, renders a placeholder state if no real digest data is available.
async function getCurrentDigest(): Promise<{
  weekDate: string;
  leadCount: number;
  areaLabel: string;
  precision?: number;
  weeksOfHistory: number;
  das: StubDA[];
} | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/digests/current`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function DigestPage() {
  const digest = await getCurrentDigest();

  if (!digest) {
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

  return (
    <div className="space-y-0">
      <DigestHeader
        weekDate={digest.weekDate}
        leadCount={digest.leadCount}
        areaLabel={digest.areaLabel}
        precision={digest.precision}
        weeksOfHistory={digest.weeksOfHistory}
      />

      {/* 12 cards inline — NO pagination per design §7.6 */}
      <div
        className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4"
        aria-label={`${digest.leadCount} DA leads this week`}
        aria-busy={false}
      >
        {digest.das.map((da) => (
          <DACard
            key={da.id}
            daId={da.id}
            address={da.address}
            lga={da.lga}
            relevanceScore={da.relevanceScore}
            estimatedValue={da.estimatedValue}
            whyMatched={da.whyMatched}
            scopeText={da.scopeText}
            applicantName={da.applicantName}
            portalUrl={da.portalUrl}
          />
        ))}
      </div>

      {digest.das.length > 0 && (
        <div
          className="text-center py-6 text-xs text-[#829AB1] border-t border-[#E5E5E5]"
          role="contentinfo"
        >
          ─── End of digest · {digest.leadCount} {digest.leadCount === 1 ? "lead" : "leads"} ───
        </div>
      )}
    </div>
  );
}
