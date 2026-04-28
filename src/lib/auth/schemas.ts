// Central Zod schemas for all auth flows.
// Imported by API route handlers AND by frontend forms (react-hook-form + @hookform/resolvers/zod).
// contract.backend.validators = zod 3
import { z } from "zod";

// ── Password policy (mirrors passwords.ts#validatePasswordPolicy) ─────────────
const passwordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters.")
  .max(128, "Password must be at most 128 characters.");

// ── E.164 mobile ──────────────────────────────────────────────────────────────
const mobileE164Schema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, "Mobile must be in E.164 format (e.g. +61412345678).");

// ── Signup ────────────────────────────────────────────────────────────────────
export const SignupSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: passwordSchema,
  mobile_e164: mobileE164Schema,
  /** AU roofing product — trade is locked to 'roofing' in V1. */
  trade: z.literal("roofing").default("roofing"),
  /** User must accept terms before creating an account. */
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the terms to sign up." }),
  }),
});
export type SignupInput = z.infer<typeof SignupSchema>;

// ── Login ─────────────────────────────────────────────────────────────────────
export const LoginSchema = z.object({
  email: z.string().email("Invalid email address."),
  password: z.string().min(1, "Password is required."),
});
export type LoginInput = z.infer<typeof LoginSchema>;

// ── OTP verification (email-verify & login-step-2) ───────────────────────────
export const OtpVerifySchema = z.object({
  /** 6-digit numeric OTP sent to the user's email. */
  code: z
    .string()
    .length(6, "OTP must be exactly 6 digits.")
    .regex(/^\d{6}$/, "OTP must be numeric."),
});
export type OtpVerifyInput = z.infer<typeof OtpVerifySchema>;

// ── Password-reset request ────────────────────────────────────────────────────
export const PasswordResetRequestSchema = z.object({
  email: z.string().email("Invalid email address."),
});
export type PasswordResetRequestInput = z.infer<typeof PasswordResetRequestSchema>;

// ── Password-reset confirm ────────────────────────────────────────────────────
export const PasswordResetConfirmSchema = z.object({
  /** Opaque reset token from the email link. */
  token: z.string().min(1, "Reset token is required."),
  password: passwordSchema,
});
export type PasswordResetConfirmInput = z.infer<typeof PasswordResetConfirmSchema>;
