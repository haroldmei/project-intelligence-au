"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface ResetFormData {
  password: string;
  confirmPassword: string;
}

function ResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ResetFormData>();

  const password = watch("password");

  async function onSubmit(data: ResetFormData) {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: data.password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? "Reset failed. The link may have expired.");
        return;
      }
      router.push("/login?reset=success");
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-sm p-6">
        <p className="text-sm text-[#DC2626]">
          Invalid reset link. Please request a new one.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-sm p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#102A43]">Set new password</h1>
        <p className="text-sm text-[#627D98] mt-1">
          Choose a strong password of at least 12 characters.
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
            htmlFor="password"
            className="block text-sm font-medium text-[#334E68]"
          >
            New password
          </label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              error={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              className="pr-12"
              {...register("password", {
                required: "Password is required.",
                minLength: { value: 12, message: "At least 12 characters." },
              })}
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute right-0 top-0 h-full min-w-[44px] flex items-center justify-center text-[#829AB1] hover:text-[#334E68] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] rounded-r-md"
            >
              {showPassword ? "🙈" : "👁"}
            </button>
          </div>
          {errors.password && (
            <p id="password-error" className="text-xs text-[#DC2626]" role="alert">
              {errors.password.message}
            </p>
          )}
        </div>

        <div className="space-y-1">
          <label
            htmlFor="confirmPassword"
            className="block text-sm font-medium text-[#334E68]"
          >
            Confirm password
          </label>
          <Input
            id="confirmPassword"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            error={!!errors.confirmPassword}
            aria-describedby={errors.confirmPassword ? "confirm-error" : undefined}
            {...register("confirmPassword", {
              required: "Please confirm your password.",
              validate: (v) =>
                v === password || "Passwords do not match.",
            })}
          />
          {errors.confirmPassword && (
            <p id="confirm-error" className="text-xs text-[#DC2626]" role="alert">
              {errors.confirmPassword.message}
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
          {isSubmitting ? "Resetting…" : "Set new password"}
        </Button>
      </form>
    </div>
  );
}

export default function ResetPage() {
  return (
    <Suspense fallback={<div className="text-sm text-[#627D98]">Loading…</div>}>
      <ResetForm />
    </Suspense>
  );
}
