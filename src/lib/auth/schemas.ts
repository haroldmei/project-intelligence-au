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
// Accepts 9-digit AU mobile (starting with 4) — frontend sends just the trailing digits;
// the API route prepends +61 before storing. Full E.164 (+61XXXXXXXXX) is also accepted
// for server-side calls that already have the normalised value.
const mobileE164Schema = z
  .string()
  .transform((v) => (v.startsWith("+") ? v : `+61${v}`))
  .pipe(
    z
      .string()
      .regex(
        /^\+614\d{8}$/,
        "Australian mobile must start with 4 and be 9 digits (e.g. 412 345 678)."
      )
  );

// ── Signup ────────────────────────────────────────────────────────────────────
export const SignupSchema = z.object({
  email: z.string().email("Invalid email address.").max(254, "Email must be at most 254 characters (RFC 5321)."),
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
  email: z.string().email("Invalid email address.").max(254, "Email must be at most 254 characters (RFC 5321)."),
  // Max 128 chars mirrors signup passwordSchema — stops argon2.verify receiving a huge candidate (AT-004).
  password: z.string().min(1, "Password is required.").max(128, "Password must be at most 128 characters."),
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

// ── Change pending email (pre-verification) ──────────────────────────────────
// Lets a signed-in but unverified user correct a mistyped signup address so the
// OTP can actually reach them (issue #92). Same email rules as signup.
export const ChangeEmailSchema = z.object({
  email: z.string().email("Invalid email address.").max(254, "Email must be at most 254 characters (RFC 5321)."),
});
export type ChangeEmailInput = z.infer<typeof ChangeEmailSchema>;

// ── Password-reset request ────────────────────────────────────────────────────
export const PasswordResetRequestSchema = z.object({
  email: z.string().email("Invalid email address.").max(254, "Email must be at most 254 characters (RFC 5321)."),
});
export type PasswordResetRequestInput = z.infer<typeof PasswordResetRequestSchema>;

// ── Password-reset confirm ────────────────────────────────────────────────────
export const PasswordResetConfirmSchema = z.object({
  /** Opaque reset token from the email link. */
  token: z.string().min(1, "Reset token is required."),
  password: passwordSchema,
});
export type PasswordResetConfirmInput = z.infer<typeof PasswordResetConfirmSchema>;
