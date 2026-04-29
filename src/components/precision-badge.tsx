import { Badge } from "@/components/ui/badge";

interface PrecisionBadgeProps {
  precision: number; // 0–100
  weeks?: number;
}

export function PrecisionBadge({ precision, weeks = 4 }: PrecisionBadgeProps) {
  return (
    <Badge variant="precision" className="flex items-center gap-1 text-xs">
      <span>{Math.round(precision)}% precision</span>
      <span aria-hidden="true">·</span>
      <span>{weeks}-week avg</span>
      <span
        role="img"
        aria-label="Information: precision is the share of digest leads that were genuine re-roof opportunities"
        title="Precision is the share of digest leads that were genuine re-roof opportunities based on your thumbs feedback"
        className="ml-0.5 cursor-help"
      >
        ⓘ
      </span>
    </Badge>
  );
}
