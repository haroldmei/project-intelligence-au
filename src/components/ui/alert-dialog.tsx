"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  confirmVariant?: "destructive" | "primary";
  isLoading?: boolean;
}

/**
 * Minimal AlertDialog — no Radix dependency, same keyboard behaviour.
 * Focus traps to dialog; Escape closes; default focus on cancel (safe default).
 */
export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Keep my plan",
  onConfirm,
  confirmVariant = "destructive",
  isLoading,
}: AlertDialogProps) {
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  // Focus the cancel button when dialog opens
  React.useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
    }
  }, [open]);

  // Escape key handler
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onOpenChange(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="alert-dialog-title"
      aria-describedby="alert-dialog-desc"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />
      {/* Dialog card */}
      <div
        ref={dialogRef}
        className={cn(
          "relative z-10 w-full max-w-sm mx-4 bg-white rounded-xl shadow-md p-6 flex flex-col gap-4",
          "md:max-w-md"
        )}
      >
        <h2
          id="alert-dialog-title"
          className="text-xl font-semibold text-[#102A43]"
        >
          {title}
        </h2>
        <div
          id="alert-dialog-desc"
          className="text-sm text-[#334E68] leading-relaxed"
        >
          {description}
        </div>
        <div className="flex flex-col gap-3 mt-2">
          <Button
            variant={confirmVariant}
            size="lg"
            className="w-full"
            onClick={onConfirm}
            disabled={isLoading}
            aria-busy={isLoading}
          >
            {isLoading ? "Processing…" : confirmLabel}
          </Button>
          <Button
            ref={cancelRef}
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
