import { Badge } from "@/components/ui/badge";

interface LGABadgeProps {
  label: string;
  className?: string;
}

export function LGABadge({ label, className }: LGABadgeProps) {
  return (
    <Badge variant="lga" className={className}>
      {label}
    </Badge>
  );
}
