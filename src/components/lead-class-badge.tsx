import { Badge } from "@/components/ui/badge";
import { LEAD_CLASS_META, type LeadClass } from "@/modules/relevance/lead-class";

interface LeadClassBadgeProps {
  leadClass: LeadClass;
  className?: string;
}

/**
 * The honest lead-class badge (issue #14) — "Fast-track", "Strata & heritage"
 * or "Builder pipeline". One subtle hue per class; the blurb is exposed as a
 * title/aria hint so the label stays short on the card.
 */
export function LeadClassBadge({ leadClass, className }: LeadClassBadgeProps) {
  const meta = LEAD_CLASS_META[leadClass];
  return (
    <Badge variant={leadClass} className={className} title={meta.blurb} aria-label={`Lead class: ${meta.label}`}>
      {meta.label}
    </Badge>
  );
}
