import * as React from "react";
import { cn } from "@/lib/utils";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "lga" | "precision" | "success" | "error";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  const variants: Record<string, string> = {
    default:
      "bg-[#D4DDE8] text-[#1E3A5F] border border-[#A9BBCF]",
    lga:
      "bg-[#FEF3C7] text-[#78350F] border border-[#FDE68A]",
    precision:
      "bg-[#FEF3C7] text-[#78350F] border border-[#D97706]",
    success:
      "bg-[#DCFCE7] text-[#14532D]",
    error:
      "bg-[#FEE2E2] text-[#7F1D1D]",
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
