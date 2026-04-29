import type { Metadata } from "next";
import Link from "next/link";
import { PrecisionBadge } from "@/components/precision-badge";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "Digest History — ProjectIntelligence AU",
};

// TODO: replace with real fetch from GET /api/digests once backend-developer publishes the route.
interface DigestSummary {
  id: string;
  weekDate: string;
  leadCount: number;
  areaLabel: string;
  precision?: number;
}

async function getDigestHistory(): Promise<DigestSummary[]> {
  try {
    const res = await fetch(
      `${env.NEXT_PUBLIC_APP_URL}/api/digests`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

export default async function HistoryPage() {
  const digests = await getDigestHistory();

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
          {digests.map((digest) => (
            <li key={digest.id}>
              <Link
                href={`/digest/${digest.id}`}
                className="block rounded-md border border-[#E5E5E5] bg-white shadow-sm p-4 hover:shadow-md transition-shadow duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-1 min-h-[44px]"
                aria-label={`Digest from ${digest.weekDate}, ${digest.leadCount} leads, ${digest.areaLabel}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <p className="font-semibold text-[#102A43] text-sm">
                      {digest.weekDate}{" "}
                      <span className="text-[#627D98] font-normal">
                        · {digest.leadCount} {digest.leadCount === 1 ? "lead" : "leads"}
                      </span>
                    </p>
                    <p className="text-xs text-[#829AB1]">{digest.areaLabel}</p>
                    {digest.precision !== undefined && (
                      <PrecisionBadge precision={digest.precision} />
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
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
