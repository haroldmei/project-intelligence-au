// Digest assembly — builds the weekly-digest email + SMS props from pipeline output.
// WEDGE: The Sunday-night roofing DA digest for Sydney subbies — 15 LGAs, 5–15 leads, AUD 99/mo, signup in 60 seconds.
// STACK: docs/00-tech-stack.md @ 2026-Q2
// FR-009, FR-010, FR-011, FR-012 | system-design §2 digest component
import { createHash } from "node:crypto";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email/client";
import { buildListUnsubscribeHeaders } from "@/lib/email/list-unsubscribe";
import { sendSms, SMS_SENDER_ID, SMS_STOP_FOOTER } from "@/lib/sms/client";
import { issueFeedbackToken, issueUnsubscribeToken } from "@/lib/hmac/token";
import { captureServer } from "@/lib/analytics/server";
import { env } from "@/lib/env";
import type { RelevanceRunResult } from "@/modules/relevance/run";
import { classifyLeadClass, toLeadClass, type LeadClass } from "@/modules/relevance/lead-class";
import { MIN_FEEDBACK_FOR_PERSONALISATION } from "@/modules/relevance/thumbs";
import { DIGEST_EMAIL_MAX_CARDS, DIGEST_SMS_MAX_CARDS } from "./constants";
import {
  computeRatedLeadRecap,
  countSentDigests,
  RECAP_MIN_WEEKS,
} from "./recap";
import pino from "pino";

const log = pino({ name: "digest-assemble" });

const APP_BASE_URL = env.NEXT_PUBLIC_APP_URL;

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
  relevance: RelevanceRunResult | null,
): Promise<DigestSendResult> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    include: {
      lgaBundles: { include: { bundle: { select: { label: true } } } },
    },
  });

  // On the recovery/retry path (issue #196) `relevance` is null: once an earlier
  // tick persisted this run's DigestDa cards they are the immutable source of
  // truth for the email, SMS, portal, and CSV, and the email is rebuilt from
  // THEM below rather than from a fresh, non-deterministic re-score that could
  // list a different lead set (or collapse to a quiet-week email while ≥5 real
  // leads sit persisted). On the first assembly — and the issue #161 audit-stub
  // backfill — relevance is present and these are the leads to persist.
  const results = relevance ? relevance.results.slice(0, DIGEST_EMAIL_MAX_CARDS) : [];

  // Freeze the service-area label as it stands right now (issue #138). This is
  // what the history list / detail header will show for THIS digest forever, so
  // a later area change can't retroactively relabel it. Same join the portal
  // loaders use for the live area (" + "). NULL when the user somehow has no
  // bundles — the portal then falls back to their live area.
  const lgaLabels = user.lgaBundles.map((sub) => sub.bundle.label);
  const areaSnapshot = lgaLabels.length > 0 ? lgaLabels.join(" + ") : null;

  // Honest lead class per lead (issue #14). Deterministic + pure over the DA's
  // scope text (+ approval pathway once #10 populates it). Computed ONCE here so
  // the persisted DigestDa.leadClass and the email/portal badge always agree.
  const leadClasses: LeadClass[] = results.map((r) =>
    classifyLeadClass({
      approvalPathway: r.candidate.approvalPathway,
      description: r.candidate.description,
      rawScopeText: r.candidate.rawScopeText,
    }),
  );

  // Re-send protection: idempotent retry resume (issue #12) + overlapping-cron
  // guard (issue #93).
  //
  // Sequential retry tick: the primary attempt partially failed, so a Digest row
  // already exists — reuse it and re-send ONLY the channel that failed (tracked
  // by *AlreadyDelivered below), never double-mailing a channel that succeeded.
  //
  // Concurrent overlap: two cron invocations reach here for the same (userId,
  // runId) at once. Both miss this findFirst, but @@unique([userId, runId]) lets
  // only ONE create win; the loser catches P2002 and returns WITHOUT sending —
  // mirroring StormBrief (commit the dedupe row, then send). So overlapping ticks
  // email each user at most once and never duplicate the DigestDa cards.
  const existing = await db.digest.findFirst({
    where: { userId, runId },
    select: { id: true, emailStatus: true, smsStatus: true, fallbackUsed: true },
  });

  let digest: { id: string };
  if (existing) {
    digest = existing;
  } else {
    try {
      digest = await db.digest.create({
        data: {
          userId,
          runId,
          daCount: results.length,
          // A create only happens when no Digest row existed yet, which is the
          // fresh-assembly path — so `relevance` is always present here.
          fallbackUsed: relevance?.fallbackUsed ?? false,
          areaLabel: areaSnapshot,
        },
      });
    } catch (err) {
      if ((err as { code?: string }).code !== "P2002") throw err;
      // A concurrent invocation already claimed this (userId, runId) and owns
      // the send. Back off atomically rather than racing on the non-atomic
      // findFirst — the whole point of issue #93.
      const winner = await db.digest.findFirstOrThrow({
        where: { userId, runId },
        select: { id: true, daCount: true, emailStatus: true, smsStatus: true },
      });
      log.info(
        { userId, runId, digestId: winner.id },
        "[digest] concurrent invocation owns this digest — not sending",
      );
      return {
        digestId: winner.id,
        daCount: winner.daCount,
        emailStatus: winner.emailStatus ?? "pending",
        smsStatus: winner.smsStatus ?? "skipped",
      };
    }
  }

  const emailAlreadyDelivered =
    existing?.emailStatus === "sent" || existing?.emailStatus === "skipped_optout";
  const smsAlreadyDelivered = existing?.smsStatus === "sent" || existing?.smsStatus === "skipped";

  // Persist the DA cards when they're missing (FR-012: DA card stores portal_url).
  //
  // Normally that's the first assembly. But a retry tick can also reach here with
  // an existing *audit stub* Digest: the primary tick's hard-failure branch writes
  // Digest{daCount:0, emailStatus:"failed"} with NO DigestDa rows (cron.ts
  // recordAuditDigest), and that stub matches the findFirst above. Gating card
  // creation on `!existing` alone would then skip the cards forever — the retry
  // re-sends the email with 5–15 real leads but the portal, history, and CSV
  // export show that week as 0 leads with no cards (issue #161).
  //
  // So gate on whether the cards actually exist yet, not on `!existing`: backfill
  // them whenever they're absent, while a genuine per-channel retry (cards already
  // persisted) never double-creates them.
  const cardsAlreadyPersisted = existing
    ? (await db.digestDa.count({ where: { digestId: digest.id } })) > 0
    : false;
  if (!cardsAlreadyPersisted) {
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      await db.digestDa.create({
        data: {
          digestId: digest.id,
          daId: r.daId,
          relevanceScore: r.score * 2, // 0–5 → 0–10 per schema comment
          whyMatched: r.why,
          rank: i + 1,
          leadClass: leadClasses[i],
        },
      });
    }
  }

  const weekStart = getWeekStartLabel();

  // Card source of truth (issue #196). When the cards were persisted on an
  // earlier tick, rebuild the email/SMS from those DigestDa → DA rows so a
  // recovery re-send lists EXACTLY the leads the portal, history, and CSV
  // already show (same ids, order, why-text) — never a fresh re-score that
  // diverges or collapses to a quiet week. Otherwise (first assembly or the
  // issue #161 audit-stub backfill) build from the relevance candidates we
  // already have, with no per-card DB roundtrip.
  const cards = cardsAlreadyPersisted
    ? await buildEmailCardsFromPersisted(digest.id, userId)
    : results.map((r, i) => {
        const c = r.candidate;
        return {
          id: r.daId,
          address: c.address,
          lga: c.council,
          value: c.estimatedValue ? `AUD ${formatValue(c.estimatedValue)}` : undefined,
          why: r.why,
          scope: c.description.slice(0, 200),
          applicant: c.applicantName ?? "",
          relevanceScore: r.score * 2,
          leadClass: leadClasses[i],
          constructionCertifiedAt: c.constructionCertifiedAt,
          portalUrl: c.portalUrl,
          thumbUpUrl: buildFeedbackUrl(userId, r.daId, 1),
          thumbDownUrl: buildFeedbackUrl(userId, r.daId, 0),
        };
      });

  // Everything the email reports about digest size now derives from `cards`, so
  // a recovered email can never claim a different lead count than the persisted
  // rows. On recovery the degraded-mode flag comes from the persisted Digest row;
  // fallbackReason isn't persisted, so the "basic mode" note falls back to the
  // generic cost-cap wording on a recovered fallback week — a cosmetic edge that
  // never changes the lead set. The fresh run supplies both directly.
  const daCount = cards.length;
  const fallbackUsed = cardsAlreadyPersisted
    ? (existing?.fallbackUsed ?? false)
    : (relevance?.fallbackUsed ?? false);
  const fallbackReason = cardsAlreadyPersisted ? undefined : relevance?.fallbackReason;
  const dasChecked = cardsAlreadyPersisted ? undefined : relevance?.stats.ruleFiltered;

  // Spam Act 2003 — opt-out takes effect IMMEDIATELY. A run iterates many
  // users in one invocation; a STOP (SMS) or unsubscribe (email) that lands
  // after this digest was assembled must still suppress the send. So re-read
  // the opt-in flags from the DB at send time rather than trusting the copy
  // loaded when assembly started.
  const optState = await db.user.findUnique({
    where: { id: userId },
    select: { emailOptIn: true, smsOptIn: true, mobile_e164: true },
  });
  const emailOptIn = optState?.emailOptIn ?? user.emailOptIn;
  const smsOptIn = optState?.smsOptIn ?? false;
  const mobile = optState?.mobile_e164 ?? null;

  // Weekly rated-lead recap stat (CF-1.7, design pillar P4, issue #186): the
  // "Last 4 weeks: you marked N of M rated leads on-target" block at the top of
  // the email — the month-2/3 retention proof. Only from week 4 (this send counts
  // as the current week, so add 1 to the count of already-sent digests) and only
  // when the user has rated some leads.
  const [priorSent, recap] = await Promise.all([
    countSentDigests(userId, digest.id),
    computeRatedLeadRecap(userId),
  ]);
  const ratedLeadRecap =
    recap && priorSent + 1 >= RECAP_MIN_WEEKS ? recap : undefined;

  // One-time "your digest is now personalised" note (FR-025, issue #96 A3).
  // Thumbs personalisation activates once a user has ≥ 25 all-time feedback
  // rows (src/modules/relevance/thumbs.ts). Tell them — once — the week it
  // kicks in, then never again (guarded by User.personalisationNotifiedAt).
  // Skip the count query entirely for the already-notified common case.
  const alreadyPersonalised = user.personalisationNotifiedAt != null;
  const feedbackCount = alreadyPersonalised
    ? 0
    : await db.daFeedback.count({ where: { userId } });
  const showPersonalisationNote =
    !alreadyPersonalised && feedbackCount >= MIN_FEEDBACK_FOR_PERSONALISATION;

  // Send email (FR-010). On a retry, skip the send entirely if the primary
  // tick already delivered it — re-sending would double-mail the user.
  let emailStatus = existing?.emailStatus ?? "pending";
  if (emailAlreadyDelivered) {
    log.info({ userId, digestId: digest.id }, "[digest] email already delivered — not re-sending");
  } else if (!emailOptIn) {
    emailStatus = "skipped_optout";
    log.info({ userId, digestId: digest.id }, "[digest] email suppressed — unsubscribed");
  } else {
    // Same token backs both the in-body footer link and the RFC-8058 header so
    // the inbox one-click and the visible "Unsubscribe" line stay in lockstep.
    const unsubscribeUrl = buildUnsubscribeUrl(userId);
    try {
      await sendEmail({
        to: user.email,
        template: "weekly-digest",
        // RFC-8058 one-click unsubscribe — the weekly digest is the bulk send
        // Gmail/Yahoo's bulk-sender rules target (issue #179). The header URL
        // opts out ONLY on POST, so a mail scanner's prefetch GET can't.
        headers: buildListUnsubscribeHeaders(unsubscribeUrl),
        props: {
          weekStart,
          leadCount: daCount,
          lgas: lgaLabels,
          cards,
          // FR-010 quiet week (issue #58): the count of DAs the relevance
          // pipeline actually scanned this week. `ruleFiltered` is the roofing-
          // relevant candidate pool in the user's LGAs after the rule pass —
          // the honest "we checked N DAs" number for a no-lead reassurance.
          dasChecked,
          ratedLeadRecap,
          smsEnabled: smsOptIn,
          fallbackUsed,
          // Distinguish the cost-cap throttle from a transient Anthropic outage
          // (system-design §7.3) so the two degraded weeks read differently.
          fallbackReason,
          personalisationActivated: showPersonalisationNote,
          unsubscribeUrl,
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
  }

  // Send SMS to top-3 if opted in (FR-011). Uses the freshly re-read flag so a
  // mid-run STOP suppresses the SMS even though `user.smsOptIn` was true at
  // assembly time. On a retry, skip if the primary tick already delivered it.
  let smsStatus = existing?.smsStatus ?? "skipped";
  if (smsAlreadyDelivered) {
    log.info({ userId, digestId: digest.id }, "[digest] sms already delivered — not re-sending");
  } else if (smsOptIn && mobile && cards.length > 0) {
    const top3 = cards.slice(0, DIGEST_SMS_MAX_CARDS);
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
    const sent = await sendSms({ to: mobile, body: smsBody });
    smsStatus = sent ? "sent" : "failed";
  } else {
    // Not opted in / no mobile — nothing to send this pass. Reset any prior
    // "failed" so the row doesn't stay retryable after the user opts out.
    smsStatus = "skipped";
  }

  // Update Digest with send statuses
  await db.digest.update({
    where: { id: digest.id },
    data: {
      sentAt: new Date(),
      emailStatus,
      smsStatus,
      // Backfill daCount alongside the cards we just created. An audit stub was
      // written with daCount:0, so without this the recovered digest would report
      // 0 leads even though its DigestDa rows now exist (issue #161). Left
      // untouched on a per-channel retry whose cards + count were already persisted.
      ...(cardsAlreadyPersisted ? {} : { daCount }),
      // Backfill fallbackUsed on the audit-stub recovery path (issue #227).
      // The stub was written with fallbackUsed:false, so a recovery that degraded
      // to the embedding-only path must overwrite it — otherwise the portal
      // history shows a normal week while the delivered email said 'basic mode'.
      // Left untouched on a pure per-channel retry (relevance is null then).
      ...(relevance ? { fallbackUsed: relevance.fallbackUsed } : {}),
    },
  });

  // North-star funnel entry: a digest was sent to this user. Card count +
  // fallbackUsed only — no DA payload text (issue #17). Fire only when THIS
  // pass delivered the email, so a retry recovering the SMS channel (email
  // already sent on the primary tick) doesn't double-count the funnel.
  if (emailStatus === "sent" && !emailAlreadyDelivered) {
    captureServer(userId, "digest_sent", {
      cardCount: daCount,
      fallbackUsed,
    });

    // Burn the one-time personalisation note only once it's actually gone out
    // in a delivered email — a suppressed/failed send must not consume it.
    if (showPersonalisationNote) {
      await db.user.update({
        where: { id: userId },
        data: { personalisationNotifiedAt: new Date() },
      });
      captureServer(userId, "personalisation_activated", { feedbackCount });
    }
  }

  return { digestId: digest.id, daCount, emailStatus, smsStatus };
}

/**
 * Rebuild the email/SMS cards for a run from its persisted DigestDa → DA rows
 * (issue #196). These rows were frozen on the primary tick, so on a recovery
 * re-send we ship exactly them rather than a fresh, non-deterministic re-score.
 *
 * The projection + per-field mapping mirror the fresh path's card build (and the
 * portal loader's DA → card mapping) field-for-field — same 0–10 relevanceScore,
 * same `AUD Nk` value formatting, same yyyy-mm-dd CC date, same 200-char scope —
 * so the recovered email is byte-equivalent to the persisted portal digest.
 * Ordered by rank so lead order matches too.
 */
async function buildEmailCardsFromPersisted(digestId: string, userId: string) {
  const rows = await db.digestDa.findMany({
    where: { digestId },
    orderBy: { rank: "asc" },
    include: {
      da: {
        select: {
          address: true,
          council: true,
          estimatedValue: true,
          description: true,
          applicantName: true,
          portalUrl: true,
          constructionCertifiedAt: true,
        },
      },
    },
  });
  return rows.map((dd) => ({
    id: dd.daId,
    address: dd.da.address,
    lga: dd.da.council,
    value: dd.da.estimatedValue
      ? `AUD ${formatValue(Number(dd.da.estimatedValue))}`
      : undefined,
    why: dd.whyMatched,
    scope: dd.da.description.slice(0, 200),
    applicant: dd.da.applicantName ?? "",
    relevanceScore: dd.relevanceScore,
    leadClass: toLeadClass(dd.leadClass),
    constructionCertifiedAt:
      dd.da.constructionCertifiedAt?.toISOString().slice(0, 10) ?? null,
    portalUrl: dd.da.portalUrl,
    thumbUpUrl: buildFeedbackUrl(userId, dd.daId, 1),
    thumbDownUrl: buildFeedbackUrl(userId, dd.daId, 0),
  }));
}

function buildFeedbackUrl(userId: string, daId: string, vote: 1 | 0): string {
  const token = issueFeedbackToken(userId, daId, vote);
  // The token-validating GET handler is the dynamic [token] PATH segment
  // (src/app/api/feedback/[token]/route.ts) — same pattern as the unsubscribe
  // link below. A ?token= query form hits /api/feedback (POST-only, Lucia
  // portal) and 405s, so the tap records nothing (issue #49).
  return `${APP_BASE_URL}/api/feedback/${encodeURIComponent(token)}`;
}

/**
 * Build the unauthenticated, token-based email unsubscribe link (Spam Act
 * 2003: no login, no fee). Same HMAC pattern as the thumbs links.
 */
function buildUnsubscribeUrl(userId: string): string {
  const token = issueUnsubscribeToken(userId);
  return `${APP_BASE_URL}/api/unsubscribe/${encodeURIComponent(token)}`;
}

/**
 * Build the SMS body. Each lead line follows FR-011/UI-003's format
 * `[Address] | [Scope] | AUD [Value] | [link]` so a tradie can tell WHAT the
 * job is (re-roof vs demolition vs extension) without tapping through — the
 * scope is the whole point of the top-3 teaser.
 *
 * Stays within FR-011's budget of 3 concatenated segments (≤ 459 GSM-7 / ≤ 201
 * UCS-2). Uses encoding-aware capping so non-GSM-7 chars in source data never
 * silently blow the segment budget. The scope
 * is capped to ≤ 20 words (FR-011) and shrinks first, then addresses truncate,
 * and only as a last resort is a card dropped — surfacing the "fewer leads but
 * still scoped" tradeoff rather than silently omitting the scope field. Sender-id
 * + STOP footer strings come from the centralised SMS client so this call site
 * and the client can never drift apart.
 */
// ─── SMS encoding constants (FR-011: ≤ 3 concatenated segments) ────
// GSM-7 (GSM 03.38 default alphabet): 153 chars per concatenated segment.
// UCS-2 (forced by any non-GSM-7 character): 67 chars per segment.
// The flat 480 from the original spec was always wrong — that's 4 GSM-7
// segments, not 3. A message of 459 GSM-7 chars packs into 3 segments.
const SMS_GSM7_CHARS_PER_SEGMENT = 153;
const SMS_UCS2_CHARS_PER_SEGMENT = 67;
const SMS_MAX_SEGMENTS = 3;
const SMS_GSM7_MAX_CHARS = SMS_GSM7_CHARS_PER_SEGMENT * SMS_MAX_SEGMENTS; // 459
const SMS_UCS2_MAX_CHARS = SMS_UCS2_CHARS_PER_SEGMENT * SMS_MAX_SEGMENTS;  // 201
const SMS_FOOTER = `\n${SMS_STOP_FOOTER}`;
const SMS_ADDRESS_FALLBACK_LEN = 40;
// FR-011/UI-003: scope is "≤ 20 words". Within the SMS budget the char cap is
// the tighter constraint, so we word-limit first (FR contract) then char-cap.
const SMS_SCOPE_MAX_WORDS = 20;
const SMS_SCOPE_MAX_LEN = 44;
const SMS_SCOPE_FALLBACK_LEN = 24;

/**
 * Derive a short, single-line scope token from a lead's description: collapse
 * whitespace, keep at most SMS_SCOPE_MAX_WORDS words (FR-011), then hard-cap to
 * `maxLen` chars with an ellipsis so the SMS budget is respected.
 */
function smsScopeToken(scope: string | undefined, maxLen: number): string {
  const clean = (scope ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  const words = clean.split(" ").slice(0, SMS_SCOPE_MAX_WORDS).join(" ");
  return words.length > maxLen ? `${words.slice(0, maxLen - 2)}..` : words;
}

/**
 * Check whether `s` is encodable in the GSM 03.38 default alphabet (basic or
 * extension table). A message that passes this test fits 153 chars per segment;
 * any non-representable character forces UCS-2 (67 chars/segment).
 */
function isGsm7Safe(s: string): boolean {
  // GSM 03.38 basic charset + extension table, per 3GPP TS 23.038 v19.0.0 §6.2.1.
  // Covers: LF, CR, SP through _ (excluding `), a–z + {|}~, Latin-1 Supplement
  // chars, Greek uppercase, and the Euro sign.
  return /^[\x0a\x0d\x20-\x5f\x61-\x7e¡£¤¥§¿ÄÅÆÇÉÑÖØÜßàäåæçèéìñòöøùüΓΔΘΛΞΠΣΦΨΩ€]*$/
    .test(s);
}

export function buildSmsBody(
  cards: Array<{ address: string; lga: string; value?: string; scope?: string; portalUrl: string }>,
  lgas: string[],
  weekStart: string,
): string {
  // Don't include every LGA in the header — the SMS doesn't need them, and a
  // user with all 4 bundles selected blows the char budget on the header alone.
  const lgaLabel = lgas.length === 1 ? lgas[0] : `${lgas.length} areas`;
  const header = `${SMS_SENDER_ID} ${weekStart} (${lgaLabel}):\n`;

  const renderLine = (
    c: { address: string; value?: string; scope?: string; portalUrl: string },
    i: number,
    addressLen: number,
    scopeLen: number,
  ) => {
    const addr = c.address.length > addressLen ? `${c.address.slice(0, addressLen - 2)}..` : c.address;
    const scope = smsScopeToken(c.scope, scopeLen);
    const scopeSeg = scope ? ` | ${scope}` : "";
    const val = c.value ? ` | ${c.value}` : "";
    return `${i + 1}. ${addr}${scopeSeg}${val}\n${APP_BASE_URL}/s/${shortSlug(c.portalUrl)}`;
  };

  const assemble = (addressLen: (c: { address: string }) => number, scopeLen: number) => {
    const lines = cards.map((c, i) => renderLine(c, i, addressLen(c), scopeLen));
    return `${header}${lines.join("\n\n")}${SMS_FOOTER}`;
  };

  // Determine the cap for the actual encoding: GSM-7 caps at 459 (3×153),
  // UCS-2 caps at 201 (3×67). Runs per-pass because truncation can remove
  // a non-GSM-7 char and move the body back to GSM-7.
  const encodingMax = (body: string) =>
    isGsm7Safe(body) ? SMS_GSM7_MAX_CHARS : SMS_UCS2_MAX_CHARS;

  // First pass: full addresses, full scope.
  let body = assemble((c) => c.address.length, SMS_SCOPE_MAX_LEN);
  if (body.length <= encodingMax(body)) return body;

  // Second pass: truncate addresses to a fixed length, keep full scope.
  body = assemble(() => SMS_ADDRESS_FALLBACK_LEN, SMS_SCOPE_MAX_LEN);
  if (body.length <= encodingMax(body)) return body;

  // Third pass: also tighten the scope before shedding a whole lead.
  body = assemble(() => SMS_ADDRESS_FALLBACK_LEN, SMS_SCOPE_FALLBACK_LEN);
  if (body.length <= encodingMax(body)) return body;

  // Last resort: drop the lowest-ranked card (still scoped) rather than silently
  // omitting the scope field from every line.
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
 * Deterministic slug from the portal URL — for SMS short links
 * (system-design §9.2 self-hosted shortener). Caller persists a `ShortUrl`
 * row keyed on this slug before sending the SMS so the /s/[slug] redirect
 * can resolve.
 *
 * Must be a HASH of the URL, not a prefix: base64-encoding the raw bytes and
 * slicing keeps only the first ~6 bytes, which is the scheme ("https:") for
 * every council portal URL — every DA would collide onto one shared ShortUrl
 * row and all SMS links would redirect to whichever DA was upserted last
 * (issue #53). A sha256 hash gives real per-DA entropy. 10 base64url chars =
 * 60 bits, ample to keep distinct portal URLs from colliding.
 */
export function shortSlug(url: string): string {
  return createHash("sha256").update(url).digest("base64url").slice(0, 10);
}
