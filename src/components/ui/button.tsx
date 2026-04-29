"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "ghost"
    | "destructive"
    | "icon";
  size?: "sm" | "md" | "lg";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      children,
      ...props
    },
    ref
  ) => {
    const base =
      "inline-flex items-center justify-center font-semibold rounded-md transition-all duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-95";

    const variants: Record<string, string> = {
      primary:
        "bg-[#D97706] text-white hover:bg-[#B45309] min-h-[44px]",
      secondary:
        "bg-white border border-[#D4D4D4] text-[#1E3A5F] hover:bg-[#D4DDE8] min-h-[44px]",
      ghost:
        "bg-transparent text-[#1E3A5F] hover:bg-[#D4DDE8] min-h-[44px]",
      destructive:
        "bg-[#DC2626] text-white hover:bg-[#B91C1C] min-h-[44px]",
      icon:
        "bg-transparent rounded-full min-h-[44px] min-w-[44px]",
    };

    const sizes: Record<string, string> = {
      sm: "h-8 px-3 text-sm",
      md: "h-10 px-4 text-sm",
      lg: "h-12 px-6 text-base",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button };
