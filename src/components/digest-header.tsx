import { PrecisionBadge } from "@/components/precision-badge";

interface DigestHeaderProps {
  weekDate: string; // e.g. "27 Apr 2026"
  leadCount: number;
  areaLabel: string; // e.g. "Western Sydney + Hills"
  precision?: number; // 0–100; only shown if defined (week 4+)
  weeksOfHistory?: number;
}

export function DigestHeader({
  weekDate,
  leadCount,
  areaLabel,
  precision,
  weeksOfHistory = 0,
}: DigestHeaderProps) {
  const showPrecision = typeof precision === "number" && weeksOfHistory >= 4;

  return (
    <header className="space-y-1 py-4 px-4 border-b border-[#E5E5E5]">
      <h1 className="text-2xl font-bold text-[#102A43] tracking-tight">
        Your Digest{" "}
        <time className="text-[#334E68] font-semibold">· {weekDate}</time>
      </h1>
      <p className="text-sm text-[#627D98]">
        {leadCount} {leadCount === 1 ? "lead" : "leads"} · {areaLabel}
      </p>
      {showPrecision && precision !== undefined && (
        <div className="pt-1">
          <PrecisionBadge precision={precision} weeks={weeksOfHistory} />
        </div>
      )}
      {!showPrecision && weeksOfHistory < 4 && leadCount > 0 && (
        <p className="text-xs text-[#829AB1] pt-1" role="status">
          Your digest gets smarter as you use it — tap 👍 or 👎 on each card.
        </p>
      )}
    </header>
  );
}
