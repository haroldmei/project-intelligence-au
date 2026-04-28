import React from "react";

interface ButtonProps {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}

export function Button({ href, children, variant = "primary" }: ButtonProps): React.ReactElement {
  const isPrimary = variant === "primary";
  return (
    <a
      href={href}
      style={{
        display: "inline-block",
        padding: "12px 24px",
        minHeight: "48px",
        backgroundColor: isPrimary ? "#1E3A5F" : "#FFFFFF",
        color: isPrimary ? "#FFFFFF" : "#1E3A5F",
        border: isPrimary ? "none" : "1px solid #1E3A5F",
        borderRadius: "6px",
        fontWeight: "600",
        fontSize: "16px",
        textDecoration: "none",
        textAlign: "center" as const,
        lineHeight: "24px",
      }}
    >
      {children}
    </a>
  );
}
