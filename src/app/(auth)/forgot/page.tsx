"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import type { PasswordResetRequestInput } from "@/lib/auth/schemas";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function ForgotPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PasswordResetRequestInput>();

  async function onSubmit(data: PasswordResetRequestInput) {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const json = await res.json();
        setServerError(json.error ?? "Request failed. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-sm p-6 space-y-4">
        <h1 className="text-2xl font-bold text-[#102A43]">Check your email</h1>
        <p className="text-sm text-[#627D98]">
          If that email address is in our system, we&apos;ve sent a reset link.
          It expires in 1 hour.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center text-sm font-medium text-[#1E3A5F] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97706] rounded"
        >
          ← Back to log in
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-sm p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#102A43]">Reset your password</h1>
        <p className="text-sm text-[#627D98] mt-1">
          Enter your email and we&apos;ll send a reset link.
        </p>
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

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="space-y-1">
          <label
            htmlFor="email"
            className="block text-sm font-medium text-[#334E68]"
          >
            Email address
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            error={!!errors.email}
            aria-describedby={errors.email ? "email-error" : undefined}
            {...register("email", { required: "Email is required." })}
          />
          {errors.email && (
            <p id="email-error" className="text-xs text-[#DC2626]" role="alert">
              {errors.email.message}
            </p>
          )}
        </div>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? "Sending…" : "Send reset link"}
        </Button>
      </form>

      <Link
        href="/login"
        className="block text-sm text-center text-[#627D98] hover:text-[#1E3A5F] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97706] rounded"
      >
        ← Back to log in
      </Link>
    </div>
  );
}
