"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const OTP_LENGTH = 6;
const RESEND_COUNTDOWN = 60;

export default function VerifyPage() {
  const router = useRouter();
  const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(""));
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(RESEND_COUNTDOWN);
  const [resendSent, setResendSent] = useState(false);
  // Destination email — shown so a typo at signup is visible (issue #92).
  const [email, setEmail] = useState<string | null>(null);
  // Inline "change email" affordance.
  const [editing, setEditing] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [changeError, setChangeError] = useState<string | null>(null);
  const [changeSubmitting, setChangeSubmitting] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Load the pending account so the verify screen can show WHICH address the
  // code went to (issue #92). Best-effort: a failure just falls back to the
  // generic copy — it must never block verification.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        if (json.emailVerified) {
          router.push("/onboarding/area");
          return;
        }
        if (typeof json.email === "string") setEmail(json.email);
      } catch {
        /* silent — keep the generic fallback copy */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // 60-second countdown for resend
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(
      () => setResendCountdown((c) => c - 1),
      1000
    );
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  const code = digits.join("");
  const isComplete = code.length === OTP_LENGTH && /^\d{6}$/.test(code);

  function handleInput(index: number, value: string) {
    // Accept only digits; handle paste
    const cleaned = value.replace(/\D/g, "");
    if (cleaned.length > 1) {
      // Pasted multi-digit
      const newDigits = [...digits];
      for (let i = 0; i < OTP_LENGTH && i < cleaned.length; i++) {
        newDigits[index + i] = cleaned[i] ?? "";
      }
      setDigits(newDigits.slice(0, OTP_LENGTH));
      const nextFocus = Math.min(index + cleaned.length, OTP_LENGTH - 1);
      inputRefs.current[nextFocus]?.focus();
      return;
    }
    const newDigits = [...digits];
    newDigits[index] = cleaned.slice(-1);
    setDigits(newDigits);
    if (cleaned && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  async function handleVerify() {
    if (!isComplete) return;
    setServerError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? "Invalid code. Please try again.");
        return;
      }
      router.push("/onboarding/area");
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleResend() {
    if (resendCountdown > 0) return;
    try {
      await fetch("/api/auth/verify-email/resend", { method: "POST" });
      setResendCountdown(RESEND_COUNTDOWN);
      setResendSent(true);
      setTimeout(() => setResendSent(false), 4000);
    } catch {
      /* silent */
    }
  }

  function openEditor() {
    setEmailDraft(email ?? "");
    setChangeError(null);
    setEditing(true);
  }

  // Correct a mistyped signup email and re-send the OTP to the fixed address
  // (issue #92). Updates the pending account before dispatching a fresh code.
  async function handleChangeEmail(e: React.FormEvent) {
    e.preventDefault();
    const next = emailDraft.trim();
    if (!next) {
      setChangeError("Enter your email address.");
      return;
    }
    setChangeError(null);
    setChangeSubmitting(true);
    try {
      const res = await fetch("/api/auth/verify-email/change-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        setChangeError(json.error ?? "Could not update your email. Please try again.");
        return;
      }
      // Reflect the corrected address, clear the stale code, restart the timer.
      setEmail(typeof json.email === "string" ? json.email : next);
      setDigits(Array(OTP_LENGTH).fill(""));
      setServerError(null);
      setEditing(false);
      setResendCountdown(RESEND_COUNTDOWN);
      setResendSent(true);
      setTimeout(() => setResendSent(false), 4000);
    } catch {
      setChangeError("Network error. Please try again.");
    } finally {
      setChangeSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-sm p-6 space-y-5">
      <div className="flex items-center justify-end text-xs text-[#829AB1]">
        <span>Step 2 of 5</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-[#102A43]">Check your email</h1>
        <p className="text-sm text-[#627D98] mt-1">
          We sent a 6-digit code to{" "}
          {email ? (
            <span className="font-semibold text-[#102A43] break-all">{email}</span>
          ) : (
            "your email address"
          )}
          .
        </p>
        {!editing ? (
          <button
            type="button"
            onClick={openEditor}
            className="mt-1 text-sm font-medium text-[#1E3A5F] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97706] rounded"
          >
            Wrong email? Change it
          </button>
        ) : (
          <form onSubmit={handleChangeEmail} className="mt-3 space-y-2" noValidate>
            <label htmlFor="change-email" className="block text-sm font-medium text-[#334E68]">
              Update your email address
            </label>
            <Input
              id="change-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="you@example.com"
              aria-describedby={changeError ? "change-email-error" : undefined}
              aria-invalid={changeError ? true : undefined}
            />
            {changeError && (
              <p id="change-email-error" role="alert" className="text-sm text-[#7F1D1D]">
                {changeError}
              </p>
            )}
            <div className="flex gap-2">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                disabled={changeSubmitting}
                aria-busy={changeSubmitting}
              >
                {changeSubmitting ? "Updating…" : "Update & resend code"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setChangeError(null);
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </div>

      {serverError && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-[#FEE2E2] text-[#7F1D1D] text-sm px-4 py-3"
        >
          {serverError}
        </div>
      )}

      {resendSent && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md bg-[#DCFCE7] text-[#14532D] text-sm px-4 py-3"
        >
          A new code has been sent.
        </div>
      )}

      {/* OTP grid — hidden single input handles paste + iOS one-time-code autofill */}
      <form onSubmit={(e) => { e.preventDefault(); handleVerify(); }}>
        <div className="relative">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={digits.join("")}
            onChange={(e) => {
              const cleaned = e.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH);
              const newDigits = Array(OTP_LENGTH).fill("");
              for (let i = 0; i < cleaned.length; i++) newDigits[i] = cleaned[i];
              setDigits(newDigits);
              const nextFocus = Math.min(cleaned.length, OTP_LENGTH - 1);
              inputRefs.current[nextFocus]?.focus();
            }}
            className="absolute inset-0 opacity-0 w-full h-full cursor-default"
            aria-hidden="true"
            tabIndex={-1}
          />
          <div
            className="flex gap-2 justify-center"
            role="group"
            aria-label="6-digit verification code"
          >
            {Array.from({ length: OTP_LENGTH }, (_, i) => (
              <input
                key={i}
                ref={(el) => {
                  inputRefs.current[i] = el;
                }}
                id={`otp-${i}`}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                maxLength={6}
                value={digits[i]}
                onChange={(e) => handleInput(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
                  if (!pasted) return;
                  const newDigits = [...digits];
                  for (let j = 0; j < OTP_LENGTH && j < pasted.length; j++) {
                    newDigits[j] = pasted[j];
                  }
                  setDigits(newDigits);
                  const nextFocus = Math.min(pasted.length, OTP_LENGTH - 1);
                  inputRefs.current[nextFocus]?.focus();
                }}
                aria-label={`Digit ${i + 1} of 6`}
                className="w-12 h-12 text-center text-xl font-bold rounded-md border border-[#E5E5E5] bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:border-[#D97706] caret-transparent"
              />
            ))}
          </div>
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full mt-5"
          disabled={!isComplete || isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? "Verifying…" : "Verify email"}
        </Button>
      </form>

      <p className="text-sm text-center text-[#627D98]">
        {resendCountdown > 0 ? (
          <>
            Didn&apos;t get it?{" "}
            <span className="text-[#A3A3A3]">
              Resend code ({resendCountdown}s)
            </span>
          </>
        ) : (
          <>
            Didn&apos;t get it?{" "}
            <button
              type="button"
              onClick={handleResend}
              className="font-medium text-[#1E3A5F] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97706] rounded"
            >
              Resend code
            </button>
          </>
        )}
      </p>
    </div>
  );
}
