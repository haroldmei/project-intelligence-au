"use client";

import { useForm } from "react-hook-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LoginInput } from "@/lib/auth/schemas";
import { sanitizeReturnTo } from "@/lib/auth/return-to";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>();

  async function onSubmit(data: LoginInput) {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? "Login failed. Check your email and password.");
        return;
      }
      // Honour ?returnTo so an email feedback tap that hit the login wall lands
      // back on /digest?feedback=recorded and its confirmation shows (issue #137).
      // Read on submit (client-only) to avoid a useSearchParams Suspense boundary;
      // sanitizeReturnTo blocks open-redirects to external targets.
      const returnTo = sanitizeReturnTo(
        new URLSearchParams(window.location.search).get("returnTo"),
      );
      router.push(returnTo);
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-sm p-6 space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[#102A43]">Log in</h1>
        <p className="text-sm text-[#627D98] mt-1">
          Welcome back. Get into your digest.
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

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[#334E68]"
            >
              Password
            </label>
            <Link
              href="/forgot"
              className="text-xs text-[#627D98] hover:text-[#1E3A5F] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97706] rounded"
            >
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              error={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              className="pr-12"
              {...register("password", { required: "Password is required." })}
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

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? "Logging in…" : "Log in"}
        </Button>
      </form>

      <p className="text-sm text-center text-[#627D98]">
        Don&apos;t have an account?{" "}
        <Link
          href="/signup"
          className="font-medium text-[#1E3A5F] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97706] rounded"
        >
          Start free trial →
        </Link>
      </p>
    </div>
  );
}
