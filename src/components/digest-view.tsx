import Link from "next/link";
import { DigestHeader } from "@/components/digest-header";
import { DACard } from "@/components/da-card";
import type { DigestDetail } from "@/modules/portal/loaders";
import { DA_SOURCE_ATTRIBUTION, DA_SOURCE_LICENCE } from "@/lib/attribution";

function formatWeekDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DigestView({
  digest,
  areaLabel,
  weeksOfHistory,
}: {
  digest: DigestDetail;
  areaLabel: string;
  weeksOfHistory: number;
}) {
  const weekDate = formatWeekDate(digest.sentAt ?? digest.runDate);
  const showFallbackBanner = digest.fallbackUsed;
  const showSendIssueBanner =
    digest.emailStatus === "failed" || digest.smsStatus === "failed";

  return (
    <div className="space-y-0">
      <DigestHeader
        weekDate={weekDate}
        leadCount={digest.daCount}
        areaLabel={areaLabel}
        ratedLeadRecap={digest.ratedLeadRecap}
        weeksOfHistory={weeksOfHistory}
      />

      {digest.cards.length > 0 && (
        <div className="px-4 pt-4 flex justify-end">
          <a
            href={`/api/export/digest/${digest.id}.csv`}
            download
            className="inline-flex items-center gap-1.5 rounded-md border border-[#E5E5E5] bg-white px-3 py-2 text-sm font-medium text-[#1E3A5F] shadow-sm hover:bg-[#F7FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-1 min-h-[44px]"
            aria-label="Export this digest's leads as a CSV file"
          >
            <span aria-hidden="true">↓</span> Export CSV
          </a>
        </div>
      )}

      {showFallbackBanner && (
        <div
          className="mx-4 mt-4 rounded-md bg-[#FEF3C7] text-[#78350F] text-sm px-4 py-3"
          role="note"
          aria-label="Degraded digest notice"
        >
          <p className="font-medium">Heads up — degraded ranking this week.</p>
          <p className="mt-1 text-xs">
            Our LLM ranker was unavailable, so this week&apos;s leads were ordered
            by semantic similarity only. They&apos;re still relevant; the order
            may not be as sharp as usual.
          </p>
        </div>
      )}

      {showSendIssueBanner && (
        <div
          className="mx-4 mt-4 rounded-md bg-[#FEE2E2] text-[#7F1D1D] text-sm px-4 py-3"
          role="alert"
        >
          <p className="font-medium">A delivery issue occurred this week.</p>
          <p className="mt-1 text-xs">
            {digest.emailStatus === "failed" && "The email send failed. "}
            {digest.smsStatus === "failed" && "The SMS send failed. "}
            You can still review the full digest below.
          </p>
        </div>
      )}

      {digest.cards.length === 0 ? (
        <div className="px-4 py-8">
          <p className="text-sm text-[#627D98]">
            No leads matched your search this week. Your search query was seeded
            at signup and cannot be edited in V1. Try expanding your{" "}
            <Link href="/account/area" className="underline text-[#D97706]">
              service area
            </Link>
            .
          </p>
        </div>
      ) : (
        <div
          className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4"
          aria-label={`${digest.daCount} DA leads this week`}
          aria-busy={false}
        >
          {digest.cards.map((card) => (
            <DACard
              key={card.daId}
              daId={card.daId}
              address={card.address}
              lga={card.council}
              relevanceScore={card.relevanceScore}
              leadClass={card.leadClass}
              constructionCertifiedAt={card.constructionCertifiedAt}
              estimatedValue={card.estimatedValue}
              whyMatched={card.whyMatched}
              scopeText={card.description.slice(0, 200)}
              applicantName={card.applicantName}
              portalUrl={card.portalUrl}
              initialFeedback={card.userFeedback}
            />
          ))}
        </div>
      )}

      {digest.cards.length > 0 && (
        <div
          className="text-center py-6 text-xs text-[#829AB1] border-t border-[#E5E5E5]"
          role="contentinfo"
        >
          ─── End of digest · {digest.daCount}{" "}
          {digest.daCount === 1 ? "lead" : "leads"} ───
        </div>
      )}

      {/* CC-BY attribution: required wherever NSW DA source data is surfaced. */}
      <div className="px-4 pb-6 text-center text-[11px] text-[#A3A3A3]">
        DA data: {DA_SOURCE_ATTRIBUTION}, licensed {DA_SOURCE_LICENCE}.
      </div>
    </div>
  );
}
