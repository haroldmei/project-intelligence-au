import { RatedLeadBadge } from "@/components/rated-lead-badge";
import type { RatedLeadRecap } from "@/modules/digest/recap";

interface DigestHeaderProps {
  weekDate: string; // e.g. "27 Apr 2026"
  leadCount: number;
  areaLabel: string; // e.g. "Western Sydney + Hills"
  // The user's trailing-window rated-lead recap (issue #186); only shown from
  // week 4. Undefined when the user has rated nothing yet.
  ratedLeadRecap?: RatedLeadRecap;
  weeksOfHistory?: number;
}

export function DigestHeader({
  weekDate,
  leadCount,
  areaLabel,
  ratedLeadRecap,
  weeksOfHistory = 0,
}: DigestHeaderProps) {
  const showRecap = ratedLeadRecap !== undefined && weeksOfHistory >= 4;

  return (
    <header className="space-y-1 py-4 px-4 border-b border-[#E5E5E5]">
      <h1 className="text-2xl font-bold text-[#102A43] tracking-tight">
        Your Digest{" "}
        <time className="text-[#334E68] font-semibold">· {weekDate}</time>
      </h1>
      <p className="text-sm text-[#627D98]">
        {leadCount} {leadCount === 1 ? "lead" : "leads"} · {areaLabel}
      </p>
      {showRecap && ratedLeadRecap && (
        <div className="pt-1">
          {/* Recap is always the trailing-4-week window (CF-1.7), regardless of
              how many total weeks of history the user has. */}
          <RatedLeadBadge
            onTarget={ratedLeadRecap.onTarget}
            rated={ratedLeadRecap.rated}
            weeks={ratedLeadRecap.weeks}
          />
        </div>
      )}
      {!showRecap && leadCount > 0 && (
        <p className="text-xs text-[#829AB1] pt-1" role="status">
          Your digest gets smarter as you use it — tap 👍 or 👎 on each card.
        </p>
      )}
    </header>
  );
}
