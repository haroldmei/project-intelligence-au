// Digest assembly — builds the weekly-digest email + SMS props from pipeline output.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 199/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-009, FR-010, FR-011, FR-012 | system-design §2 digest component
import * as Sentry from "@sentry/nextjs";
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

  // Build email cards from the relevance candidates we already have. No
  // per-card DB roundtrip — the candidate carries everything we need
  // (CandidateDA includes address, description, council, estimatedValue,
  // applicantName, portalUrl).
  const cards = results.map((r) => {
    const c = r.candidate;
    const thumbUpUrl = buildFeedbackUrl(userId, r.daId, 1);
    const thumbDownUrl = buildFeedbackUrl(userId, r.daId, 0);
    return {
      id: r.daId,
      address: c.address,
      lga: c.council,
      value: c.estimatedValue ? `AUD ${formatValue(c.estimatedValue)}` : undefined,
      why: r.why,
      scope: c.description.slice(0, 200),
      applicant: c.applicantName ?? "",
      relevanceScore: r.score * 2,
      portalUrl: c.portalUrl,
      thumbUpUrl,
      thumbDownUrl,
    };
  });

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
        fallbackUsed: relevance.fallbackUsed,
      },
    });
    emailStatus = "sent";
  } catch (err) {
    emailStatus = "failed";
    log.error({ userId, digestId: digest.id, err }, "[digest] email send failed");
    Sentry.captureException(err, {
      tags: { phase: "digest-email", userId, digestId: digest.id },
    });
  }

  // Send SMS to top-3 if opted in (FR-011)
  let smsStatus = "skipped";
  if (user.smsOptIn && user.mobile_e164 && cards.length > 0) {
    const top3 = cards.slice(0, SMS_MAX_CARDS);
    // Persist a ShortUrl row per card BEFORE building the SMS body so
    // the /s/<slug> redirect handler can resolve clicks. Without these
    // upserts the redirect endpoint returns 404 for every SMS link
    // (the historical bug C1 from the code review).
    const linkedTop3 = await Promise.all(
      top3.map(async (c) => {
        const slug = shortSlug(c.portalUrl);
        await db.shortUrl.upsert({
          where: { slug },
          create: { slug, targetUrl: c.portalUrl },
          update: { targetUrl: c.portalUrl }, // refresh in case the council URL was rewritten
        });
        return c;
      }),
    );
    const smsBody = buildSmsBody(linkedTop3, lgaLabels, weekStart);
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

/**
 * Build the SMS body. Stays within 2 SMS parts (~320 chars) to avoid
 * carrier mangling and double-billing — addresses are truncated as needed.
 */
const SMS_MAX_CHARS = 320;
const SMS_FOOTER = "\nReply STOP to opt out.";
const SMS_ADDRESS_FALLBACK_LEN = 40;

function buildSmsBody(
  cards: Array<{ address: string; lga: string; value?: string; portalUrl: string }>,
  lgas: string[],
  weekStart: string,
): string {
  // Don't include every LGA in the header — the SMS doesn't need them, and a
  // user with all 4 bundles selected blows the char budget on the header alone.
  const lgaLabel = lgas.length === 1 ? lgas[0] : `${lgas.length} areas`;
  const header = `PI-AU ${weekStart} (${lgaLabel}):\n`;

  const renderLine = (
    c: { address: string; value?: string; portalUrl: string },
    i: number,
    addressLen: number,
  ) => {
    const val = c.value ? ` ${c.value}` : "";
    const addr = c.address.length > addressLen ? `${c.address.slice(0, addressLen - 1)}…` : c.address;
    return `${i + 1}. ${addr}${val}\n${APP_BASE_URL}/s/${shortSlug(c.portalUrl)}`;
  };

  // First pass: full addresses.
  let lines = cards.map((c, i) => renderLine(c, i, c.address.length));
  let body = `${header}${lines.join("\n\n")}${SMS_FOOTER}`;
  if (body.length <= SMS_MAX_CHARS) return body;

  // Second pass: truncate addresses to a fixed length.
  lines = cards.map((c, i) => renderLine(c, i, SMS_ADDRESS_FALLBACK_LEN));
  body = `${header}${lines.join("\n\n")}${SMS_FOOTER}`;
  if (body.length <= SMS_MAX_CHARS) return body;

  // Last resort: drop the lowest-ranked card.
  if (cards.length > 1) {
    return buildSmsBody(cards.slice(0, cards.length - 1), lgas, weekStart);
  }
  // Single card already over budget — just send the over-budget version.
  // Twilio will split into multiple parts; preferable to silently dropping.
  return body;
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

/**
 * Deterministic 8-char base64url slug from the portal URL — for SMS short
 * links (system-design §9.2 self-hosted shortener). Caller persists a
 * `ShortUrl` row keyed on this slug before sending the SMS so the
 * /api/s/[slug] redirect can resolve. 8 base64url chars = 48 bits of
 * entropy, more than enough for per-DA uniqueness.
 */
function shortSlug(url: string): string {
  return Buffer.from(url).toString("base64url").slice(0, 8);
}
