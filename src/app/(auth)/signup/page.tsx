"use client";

import { useForm } from "react-hook-form";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SignupInput } from "@/lib/auth/schemas";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupInput>({
    defaultValues: { trade: "roofing" },
  });

  async function onSubmit(data: SignupInput) {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const digits = data.mobile_e164.replace(/\s/g, "");
      const normalised = digits.startsWith("+") ? digits : `+61${digits}`;
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, mobile_e164: normalised }),
      });
      const json = await res.json();
      if (!res.ok) {
        setServerError(json.error ?? "Signup failed. Please try again.");
        return;
      }
      router.push("/verify");
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-sm p-6 space-y-5">
      {/* Step indicator */}
      <div className="flex items-center justify-between text-xs text-[#829AB1]">
        <Link
          href="/"
          className="hover:text-[#1E3A5F] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] rounded"
        >
          ← Back
        </Link>
        <span>Step 1 of 4</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-[#102A43]">
          Start your 14-day trial
        </h1>
        <p className="text-sm text-[#627D98] mt-1">No sales call.</p>
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
        {/* Email */}
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

        {/* Password */}
        <div className="space-y-1">
          <label
            htmlFor="password"
            className="block text-sm font-medium text-[#334E68]"
          >
            Password
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
                minLength: {
                  value: 12,
                  message: "Password must be at least 12 characters.",
                },
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

        {/* Mobile (AU) */}
        <div className="space-y-1">
          <label
            htmlFor="mobile_e164"
            className="block text-sm font-medium text-[#334E68]"
          >
            Mobile (AU)
          </label>
          <div className="flex gap-2">
            <div className="flex items-center min-h-[48px] px-3 border border-[#E5E5E5] rounded-md bg-[#F5F5F5] text-sm text-[#334E68] font-medium select-none">
              +61
            </div>
            <Input
              id="mobile_e164"
              type="tel"
              autoComplete="tel"
              placeholder="412 345 678"
              error={!!errors.mobile_e164}
              aria-describedby="mobile-hint mobile-error"
              {...register("mobile_e164", {
                required: "Mobile number is required.",
                validate: (v) => {
                  const digits = v.replace(/\s/g, "");
                  return /^4\d{8}$/.test(digits) || "Australian mobile must start with 4 and be 9 digits.";
                },
              })}
            />
          </div>
          <p id="mobile-hint" className="text-xs text-[#829AB1]">
            9 digits starting with 4 (e.g. 412 345 678)
          </p>
          {errors.mobile_e164 && (
            <p id="mobile-error" className="text-xs text-[#DC2626]" role="alert">
              {errors.mobile_e164.message}
            </p>
          )}
        </div>

        {/* Trade — pre-selected, locked */}
        <div className="space-y-1">
          <label
            htmlFor="trade"
            className="block text-sm font-medium text-[#334E68]"
          >
            Trade
          </label>
          <div className="flex items-center min-h-[48px] px-3 border border-[#E5E5E5] rounded-md bg-[#F5F5F5] text-sm text-[#334E68]">
            Roofing
          </div>
          <input type="hidden" {...register("trade")} value="roofing" />
        </div>

        {/* Terms */}
        <div className="flex items-start gap-3 min-h-[44px]">
          <input
            id="acceptTerms"
            type="checkbox"
            className="mt-1 h-5 w-5 min-w-[20px] rounded border-[#D4D4D4] text-[#D97706] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] cursor-pointer"
            aria-describedby={errors.acceptTerms ? "terms-error" : undefined}
            {...register("acceptTerms", {
              required: "You must accept the terms to sign up.",
            })}
          />
          <label
            htmlFor="acceptTerms"
            className="text-sm text-[#334E68] cursor-pointer"
          >
            I agree to the{" "}
            <Link href="/terms" className="underline hover:text-[#1E3A5F]">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline hover:text-[#1E3A5F]">
              Privacy Policy
            </Link>
          </label>
        </div>
        {errors.acceptTerms && (
          <p id="terms-error" className="text-xs text-[#DC2626]" role="alert">
            {errors.acceptTerms.message}
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full mt-2"
          disabled={isSubmitting}
          aria-busy={isSubmitting}
        >
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="text-sm text-center text-[#627D98]">
        Already have an account?{" "}
        <Link
          href="/login"
          className="font-medium text-[#1E3A5F] hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97706] rounded"
        >
          Log in →
        </Link>
      </p>
    </div>
  );
}
