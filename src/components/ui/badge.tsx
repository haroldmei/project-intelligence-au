import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?:
    | "default"
    | "lga"
    | "recap"
    | "success"
    | "error"
    // Lead-class badges (issue #14) — distinct but subtle, one hue per class.
    | "fast_track"
    | "strata_heritage"
    | "builder_pipeline";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants: Record<string, string> = {
    default:
      "bg-[#D4DDE8] text-[#1E3A5F] border border-[#A9BBCF]",
    lga:
      "bg-[#FEF3C7] text-[#78350F] border border-[#FDE68A]",
    recap:
      "bg-[#FEF3C7] text-[#78350F] border border-[#D97706]",
    success:
      "bg-[#DCFCE7] text-[#14532D]",
    error:
      "bg-[#FEE2E2] text-[#7F1D1D]",
    // Fast-track (CDC) — cool sky; strata & heritage — plum (premium);
    // builder pipeline — muted slate. Low-saturation so they read as
    // categorisation, not alerts. Mirror the email inline styles in
    // src/emails/weekly-digest.tsx.
    fast_track:
      "bg-[#E0F2FE] text-[#0C4A6E] border border-[#BAE6FD]",
    strata_heritage:
      "bg-[#F3E8FF] text-[#6B21A8] border border-[#E9D5FF]",
    builder_pipeline:
      "bg-[#E2E8F0] text-[#334155] border border-[#CBD5E1]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold tracking-wide",
        variants[variant],
        className
      )}
      {...props}
    />
  );
}

export { Badge };
