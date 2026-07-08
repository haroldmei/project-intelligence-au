import { Badge } from "@/components/ui/badge";

interface RatedLeadBadgeProps {
  onTarget: number; // N — leads the user marked 👍 in the window
  rated: number; // M — leads the user rated (👍/👎) in the window
  weeks?: number;
}

// Rated-lead recap badge (issue #186): the user's own on-target rate over the
// leads they rated in the trailing window. Deliberately NOT labelled "precision"
// — it measures the user's thumbs, not FR-013 ground-truth precision.
export function RatedLeadBadge({ onTarget, rated, weeks = 4 }: RatedLeadBadgeProps) {
  return (
    <Badge variant="recap" className="flex items-center gap-1 text-xs">
      <span>
        {onTarget} of {rated} rated on-target
      </span>
      <span aria-hidden="true">·</span>
      <span>{weeks}-week</span>
      <span
        role="img"
        aria-label={`Information: of the leads you rated with a thumbs up or down in the last ${weeks} weeks, how many you marked on-target — your own feedback, not a ground-truth precision score`}
        title={`Of the leads you rated 👍/👎 in the last ${weeks} weeks, how many you marked on-target. Reflects your own feedback, not a ground-truth precision score.`}
        className="ml-0.5 cursor-help"
      >
        ⓘ
      </span>
    </Badge>
  );
}
