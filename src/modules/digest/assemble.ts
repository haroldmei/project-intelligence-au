// Digest assembly — builds the weekly-digest email + SMS props from pipeline output.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-009, FR-010, FR-011, FR-012 | system-design §2 digest component
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/client";
import { sendSms } from "@/lib/sms/client";
import { issueFeedbackToken } from "@/lib/hmac/token";
import { env } from "@/lib/env";
import type { RelevanceRunResult } from "@/modules/relevance/run";
import pino from "pino";

const log = pino({ name: "digest-assemble" });

const APP_BASE_URL = env.NEXT_PUBLIC_APP_URL;
const SMS_MAX_CARDS = 3;

export interface DigestSendResult {
  digestId: string;
  daCount: number;
  emailStatus: string;
  smsStatus: string;
}

/**
 * Assemble and send the digest for one user. Persists Digest + DigestDa rows.
 * FR-010: email via Resend (React Email template).
 * FR-011: SMS via Twilio for top-3 if smsOptIn.
 */
export async function assembleAndSendDigest(
  userId: string,
  runId: string,
  relevance: RelevanceRunResult,
): Promise<DigestSendResult> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      lgaBundles: { include: { bundle: { select: { label: true } } } },
    },
  });

  const results = relevance.results.slice(0, 15);
  const daCount = results.length;

  // Create Digest record
  const digest = await db.digest.create({
    data: {
      userId,
      runId,
      daCount,
      fallbackUsed: relevance.fallbackUsed,
    },
  });

  // Create DigestDa records (FR-012: DA card stores portal_url)
  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    await db.digestDa.create({
      data: {
        digestId: digest.id,
        daId: r.daId,
        relevanceScore: r.score * 2, // 0–5 → 0–10 per schema comment
        whyMatched: r.why,
        rank: i + 1,
      },
    });
  }

  const weekStart = getWeekStartLabel();
  const lgaLabels = user.lgaBundles.map((sub) => sub.bundle.label);

  // Build email cards with HMAC-signed feedback links (FR-023)
  const cards = await Promise.all(
    results.map(async (r) => {
      const da = await db.developmentApplication.findUnique({
        where: { id: r.daId },
        select: { address: true, council: true, estimatedValue: true, portalUrl: true, applicantName: true, description: true },
      });
      const thumbUpUrl = buildFeedbackUrl(userId, r.daId, 1);
      const thumbDownUrl = buildFeedbackUrl(userId, r.daId, 0);
      return {
        id: r.daId,
        address: da?.address ?? "",
        lga: da?.council ?? "",
        value: da?.estimatedValue ? `AUD ${formatValue(Number(da.estimatedValue))}` : undefined,
        why: r.why,
        scope: (da?.description ?? "").slice(0, 200),
        applicant: da?.applicantName ?? "",
        relevanceScore: r.score * 2,
        portalUrl: da?.portalUrl ?? "",
        thumbUpUrl,
        thumbDownUrl,
      };
    }),
  );

  // Send email (FR-010)
  let emailStatus = "pending";
  try {
    await sendEmail({
      to: user.email,
      template: "weekly-digest",
      props: {
        weekStart,
        leadCount: daCount,
        lgas: lgaLabels,
        cards,
        smsEnabled: user.smsOptIn,
      },
    });
    emailStatus = "sent";
  } catch (err) {
    emailStatus = "failed";
    log.error({ userId, digestId: digest.id, err }, "[digest] email send failed");
  }

  // Send SMS to top-3 if opted in (FR-011)
  let smsStatus = "skipped";
  if (user.smsOptIn && user.mobile_e164 && cards.length > 0) {
    const top3 = cards.slice(0, SMS_MAX_CARDS);
    const smsBody = buildSmsBody(top3, lgaLabels, weekStart);
    const sent = await sendSms({ to: user.mobile_e164, body: smsBody });
    smsStatus = sent ? "sent" : "failed";
  }

  // Update Digest with send statuses
  await db.digest.update({
    where: { id: digest.id },
    data: {
      sentAt: new Date(),
      emailStatus,
      smsStatus,
    },
  });

  return { digestId: digest.id, daCount, emailStatus, smsStatus };
}

function buildFeedbackUrl(userId: string, daId: string, vote: 1 | 0): string {
  const token = issueFeedbackToken(userId, daId, vote);
  return `${APP_BASE_URL}/api/feedback?token=${encodeURIComponent(token)}`;
}

function buildSmsBody(
  cards: Array<{ address: string; lga: string; value?: string; portalUrl: string }>,
  lgas: string[],
  weekStart: string,
): string {
  const header = `PI-AU Roofing leads ${weekStart} (${lgas.join(", ")}):\n`;
  const lines = cards.map((c, i) => {
    const val = c.value ? ` ${c.value}` : "";
    // Keep short for SMS (160-char parts)
    return `${i + 1}. ${c.address}${val}\n${APP_BASE_URL}/s/${shortSlug(c.portalUrl)}`;
  });
  return `${header}${lines.join("\n\n")}\nReply STOP to opt out.`;
}

function getWeekStartLabel(): string {
  const d = new Date();
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function formatValue(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}

/** Derive a short slug from a portal URL for SMS links (system-design §9.2 self-hosted shortener) */
function shortSlug(url: string): string {
  // We store ShortUrl rows at digest time; for now return a hash-based slug
  const hash = Buffer.from(url).toString("base64url").slice(0, 8);
  return hash;
}
