import { Badge } from "@/components/ui/badge";

interface ConstructionCertBadgeProps {
  /** ISO yyyy-mm-dd date the Construction Certificate was issued. */
  issuedDate: string;
  className?: string;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Format a yyyy-mm-dd date as "1 Jun 2026" without going through `Date` — a bare
 * `new Date("2026-06-01")` is UTC midnight and `toLocaleDateString` can shift it
 * a day in AEST. Parsing the parts directly keeps the displayed date exact.
 */
function formatIsoDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, year, month, day] = m;
  const monthLabel = MONTHS[Number(month) - 1] ?? month;
  return `${Number(day)} ${monthLabel} ${year}`;
}

/**
 * "CC issued — work starting" badge (issue #13). A Construction Certificate
 * means the head contractor has procured trades and is about to break ground —
 * the strongest "roofer, bid now" timing signal the data carries, distinct from
 * the DA lead class. Green ("go") to read as an action prompt, with the issue
 * date so a subbie can gauge how fresh the trigger is.
 */
export function ConstructionCertBadge({ issuedDate, className }: ConstructionCertBadgeProps) {
  const formatted = formatIsoDate(issuedDate);
  return (
    <Badge
      variant="success"
      className={className}
      title={`Construction Certificate issued ${formatted} — work is starting`}
      aria-label={`Construction Certificate issued ${formatted} — work starting`}
    >
      CC issued {formatted} — work starting
    </Badge>
  );
}
