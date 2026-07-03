// Email delivery client using Resend
// Idempotent retry wrapper with pino logging
// No-op (dev mode) when RESEND_API_KEY is unset

import { Resend } from "resend";
import pino from "pino";
import { env } from "@/lib/env";
import { VerifyEmailTemplate } from "@/emails/verify-email";
import { PasswordResetTemplate } from "@/emails/password-reset";
import { WeeklyDigestTemplate } from "@/emails/weekly-digest";
import { WelcomeAfterVerifyTemplate } from "@/emails/welcome-after-verify";
import { TrialReminderTemplate } from "@/emails/trial-reminder";
import { StormBriefTemplate } from "@/emails/storm-brief";

const logger = pino({ name: "email" });

type TemplateFn = (props: Record<string, unknown>) => { subject: string; html: string };

const TEMPLATES: Record<string, TemplateFn> = {
  "verify-email": VerifyEmailTemplate as TemplateFn,
  "password-reset": PasswordResetTemplate as TemplateFn,
  "weekly-digest": WeeklyDigestTemplate as TemplateFn,
  "welcome-after-verify": WelcomeAfterVerifyTemplate as TemplateFn,
  "trial-reminder": TrialReminderTemplate as TemplateFn,
  "storm-brief": StormBriefTemplate as TemplateFn,
};

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

// Per-environment marking — lets a tester receiving mail for both staging and
// prod at the same address tell which is which from the inbox row alone.
// Production mail is unmarked.
const SUBJECT_PREFIX: Record<string, string> = {
  staging: "[STAGING] ",
  development: "[DEV] ",
};
const FROM_NAME: Record<string, string> = {
  staging: "ProjectIntelligence (STAGING)",
  development: "ProjectIntelligence (DEV)",
};
const subjectPrefix = SUBJECT_PREFIX[env.STAGE] ?? "";
const fromName = FROM_NAME[env.STAGE] ?? "ProjectIntelligence";
const fromAddress = `${fromName} <noreply@resend.dev>`;

export interface EmailProps {
  to: string;
  template: "verify-email" | "password-reset" | "weekly-digest" | "welcome-after-verify" | "trial-reminder" | "storm-brief";
  props: Record<string, unknown>;
}

/**
 * Send email via Resend with idempotent retry on 5xx errors.
 * No-op (logged at info level) when RESEND_API_KEY is unset (dev mode).
 */
export async function sendEmail({ to, template, props }: EmailProps): Promise<void> {
  if (!resend) {
    logger.info({ to, template }, "[email] dev-mode stub — RESEND_API_KEY unset, not sending");
    return;
  }

  const templateFn = TEMPLATES[template];
  if (!templateFn) {
    throw new Error(`Unknown email template: ${template}`);
  }
  const { subject, html } = templateFn(props);

  // Retry logic: one retry on 5xx errors
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await resend.emails.send({
        from: fromAddress,
        to,
        subject: subjectPrefix + subject,
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
