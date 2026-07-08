"use client";

import { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { Button } from "@/components/ui/button";

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called after the account is erased and the session cookie cleared (200).
   * The account page uses this to sign the user out (redirect to /login).
   */
  onDeleted: () => void;
}

// The word the user must type to arm the destructive action. Type-to-confirm
// (same pattern spirit as cancel-subscription-dialog's explicit confirm step)
// so an accidental tap can't erase an account and cancel the Stripe sub.
const CONFIRM_WORD = "DELETE";

/**
 * Irreversible account-deletion flow backing the /privacy policy's "clicking
 * 'Delete account' in your account settings" promise (issue #96 A1). Wraps
 * DELETE /api/account/delete, which cancels Stripe, invalidates the session,
 * and cascade-deletes the user. A type-to-confirm gate arms the button.
 *
 * Focus is trapped while open and restored to the trigger on close.
 */
export function DeleteAccountDialog({ open, onOpenChange, onDeleted }: DeleteAccountDialogProps) {
  const [confirmText, setConfirmText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, dialogRef);

  // Reset transient state whenever the dialog opens, and focus the input.
  useEffect(() => {
    if (open) {
      setConfirmText("");
      setError(null);
      // Focus after paint so the input exists.
      const id = window.setTimeout(() => inputRef.current?.focus(), 0);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  // Escape closes (unless mid-delete).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !isDeleting) onOpenChange(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, isDeleting, onOpenChange]);

  if (!open) return null;

  const armed = confirmText.trim().toUpperCase() === CONFIRM_WORD;

  async function handleDelete() {
    if (!armed) return;
    setIsDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      onDeleted();
    } catch {
      setError("Couldn't delete your account. Please try again, or contact support.");
      setIsDeleting(false);
    }
  }

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-account-title"
      aria-describedby="delete-account-desc"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !isDeleting && onOpenChange(false)}
        aria-hidden="true"
      />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-white rounded-xl shadow-md p-6 flex flex-col gap-4 md:max-w-md">
        <h2 id="delete-account-title" className="text-xl font-semibold text-[#102A43]">
          Delete your account?
        </h2>
        <div id="delete-account-desc" className="text-sm text-[#334E68] leading-relaxed space-y-2">
          <p>
            This permanently erases your account, cancels any active subscription,
            and deletes your saved areas, digests and feedback. <strong>This can&apos;t be undone.</strong>
          </p>
          <p>
            Type <strong>{CONFIRM_WORD}</strong> to confirm.
          </p>
        </div>

        <label htmlFor="delete-confirm" className="sr-only">
          Type {CONFIRM_WORD} to confirm account deletion
        </label>
        <input
          id="delete-confirm"
          ref={inputRef}
          type="text"
          autoComplete="off"
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          disabled={isDeleting}
          aria-invalid={confirmText.length > 0 && !armed}
          className="w-full rounded-md border border-[#CBD2D9] px-3 py-2 text-sm text-[#102A43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC2626] disabled:opacity-50"
          placeholder={CONFIRM_WORD}
        />

        {error && (
          <p role="alert" className="text-sm text-[#DC2626]">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3 mt-1">
          <Button
            variant="destructive"
            size="lg"
            className="w-full"
            onClick={handleDelete}
            disabled={!armed || isDeleting}
            aria-busy={isDeleting}
          >
            {isDeleting ? "Deleting…" : "Delete my account"}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            className="w-full"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Keep my account
          </Button>
        </div>
      </div>
    </div>
  );
}
