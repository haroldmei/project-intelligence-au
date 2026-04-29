// Email delivery client using Resend
// Idempotent retry wrapper with pino logging
// No-op (dev mode) when RESEND_API_KEY is unset

import { Resend } from "resend";
import pino from "pino";
import { env } from "@/lib/env";

const logger = pino({ name: "email" });

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export interface EmailProps {
  to: string;
  template: "verify-email" | "password-reset" | "weekly-digest" | "digest-fallback-notice" | "welcome-after-verify";
  props: Record<string, unknown>;
}

/**
 * Send email via Resend with idempotent retry on 5xx errors.
 * No-op (console.log only) when RESEND_API_KEY is unset (dev mode).
 */
export async function sendEmail({ to, template, props }: EmailProps): Promise<void> {
  if (!resend) {
    logger.debug({ to, template, props }, "[DEV MODE] Email stub (RESEND_API_KEY not set)");
    console.log(`[DEV] Would send email to ${to} with template "${template}"`);
    return;
  }

  // Import templates dynamically to avoid circular imports
  let templateFn: (props: Record<string, unknown>) => { subject: string; html: string };
  switch (template) {
    case "verify-email":
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      templateFn = require("@/emails/verify-email").VerifyEmailTemplate;
      break;
    case "password-reset":
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      templateFn = require("@/emails/password-reset").PasswordResetTemplate;
      break;
    case "weekly-digest":
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      templateFn = require("@/emails/weekly-digest").WeeklyDigestTemplate;
      break;
    case "digest-fallback-notice":
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      templateFn = require("@/emails/digest-fallback-notice").DigestFallbackNoticeTemplate;
      break;
    case "welcome-after-verify":
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      templateFn = require("@/emails/welcome-after-verify").WelcomeAfterVerifyTemplate;
      break;
    default:
      throw new Error(`Unknown email template: ${template}`);
  }

  const { subject, html } = templateFn(props);

  // Retry logic: one retry on 5xx errors
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await resend.emails.send({
        from: "ProjectIntelligence <noreply@resend.dev>",
        to,
        subject,
        html,
      });

      logger.info({ to, template }, "Email sent successfully");
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if it's a transient error (5xx)
      const isTransient = lastError.message.includes("500") || lastError.message.includes("503") || lastError.message.includes("429");
      if (!isTransient || attempt === 1) {
        // Non-transient error or second attempt failed
        break;
      }

      // Log and retry after 1 second
      logger.warn({ attempt: attempt + 1, error: lastError.message, to, template }, "Email send failed, retrying...");
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // Final failure
  logger.error({ to, template, error: lastError?.message }, "Email send failed after retries");
  throw lastError;
}
