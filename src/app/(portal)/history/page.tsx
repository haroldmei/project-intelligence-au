import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { validateRequest } from "@/lib/auth/session";
import { getDigestHistory, getMyArea, type MyArea } from "@/modules/portal/loaders";
import { LeadClassBadge } from "@/components/lead-class-badge";
import { LEAD_CLASS_GROUP_ORDER } from "@/modules/relevance/lead-class";

export const metadata: Metadata = {
  title: "Digest History — ProjectIntelligence AU",
};
export const dynamic = "force-dynamic";

function formatRunDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function buildAreaLabel(area: MyArea | null): string {
  if (!area || area.lgaBundles.length === 0) return "—";
  return area.lgaBundles.map((b) => b.label).join(" + ");
}

export default async function HistoryPage() {
  const auth = await validateRequest();
  if (!auth) redirect("/login");

  const [digests, area] = await Promise.all([
    getDigestHistory(auth.user.id, 50),
    getMyArea(auth.user.id),
  ]);
  // Live area, used ONLY as a fallback for legacy digests that predate the
  // send-time snapshot (issue #138). Each row below prefers its own stored
  // areaLabel so a past digest keeps the area it actually covered.
  const currentAreaLabel = buildAreaLabel(area);

  return (
    <div className="px-4 py-6 space-y-4">
      <h1 className="text-2xl font-bold text-[#102A43]">Digest History</h1>

      {digests.length === 0 ? (
        <div className="rounded-md bg-[#E0F2FE] text-[#0C4A6E] text-sm px-4 py-4">
          <p className="font-medium">No digests yet.</p>
          <p className="mt-1 text-xs">
            Your first Sunday digest will appear here after it&apos;s sent.
          </p>
        </div>
      ) : (
        <ul className="space-y-3" aria-label="Past digests">
          {digests.map((digest) => {
            const dateLabel = formatRunDate(digest.sentAt ?? digest.runDate);
            const areaLabel = digest.areaLabel ?? currentAreaLabel;
            const sendIssue =
              digest.emailStatus === "failed" || digest.smsStatus === "failed";
            return (
              <li
                key={digest.id}
                className="rounded-md border border-[#E5E5E5] bg-white shadow-sm hover:shadow-md transition-shadow duration-[150ms]"
              >
                <Link
                  href={`/digest/${digest.id}`}
                  className="block p-4 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-1 min-h-[44px]"
                  aria-label={`Digest from ${dateLabel}, ${digest.daCount} leads, ${areaLabel}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="font-semibold text-[#102A43] text-sm">
                        {dateLabel}{" "}
                        <span className="text-[#627D98] font-normal">
                          · {digest.daCount}{" "}
                          {digest.daCount === 1 ? "lead" : "leads"}
                        </span>
                      </p>
                      <p className="text-xs text-[#829AB1]">{areaLabel}</p>
                      {digest.daCount > 0 && (
                        <div
                          className="flex flex-wrap items-center gap-1 pt-0.5"
                          aria-label="Lead classes in this digest"
                        >
                          {LEAD_CLASS_GROUP_ORDER.filter(
                            (lc) => digest.leadClassCounts[lc] > 0,
                          ).map((lc) => (
                            <span key={lc} className="inline-flex items-center gap-1">
                              <LeadClassBadge leadClass={lc} className="text-[10px]" />
                              <span className="text-[10px] text-[#829AB1]">
                                {digest.leadClassCounts[lc]}
                              </span>
                            </span>
                          ))}
                        </div>
                      )}
                      {digest.fallbackUsed && (
                        <p className="text-xs text-[#78350F]">Degraded ranking</p>
                      )}
                      {sendIssue && (
                        <p className="text-xs text-[#7F1D1D]">Delivery issue</p>
                      )}
                    </div>
                    <span
                      className="text-[#829AB1] text-sm flex-shrink-0 mt-0.5"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  </div>
                </Link>
                {digest.daCount > 0 && (
                  <div className="px-4 pb-3 -mt-1">
                    <a
                      href={`/api/export/digest/${digest.id}.csv`}
                      download
                      className="inline-flex items-center gap-1 text-xs font-medium text-[#1E3A5F] hover:text-[#D97706] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] rounded"
                      aria-label={`Export leads from ${dateLabel} as a CSV file`}
                    >
                      <span aria-hidden="true">↓</span> Export CSV
                    </a>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
