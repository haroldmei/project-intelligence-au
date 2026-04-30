// One-shot "preview digest" sent at the end of onboarding.
//
// Why: the standard Sunday digest fires once a week. A user who completes
// onboarding on Monday waits 6 days to see anything — eating nearly a quarter
// of their 28-day trial before they can validate the product. The preview
// digest closes that gap by sending an immediate digest using whatever DAs
// are in the DB right now (last week's ingest), so the new signup gets
// "instant proof" of value before they even hit the plan picker.
//
// Cost: one runRelevanceForUser pass = ~AUD $0.04 in OpenAI + Anthropic
// fees. Idempotent — only fires if the user has no prior Digest row.

import { db } from "@/lib/db";
import { runRelevanceForUser } from "@/modules/relevance/run";
import { assembleAndSendDigest } from "./assemble";
import pino from "pino";

const log = pino({ name: "digest-preview" });

/**
 * Send a preview digest to a user who's just completed onboarding.
 * Runs the full relevance pipeline. Idempotent — if the user has already
 * received any digest (preview or weekly), this is a no-op.
 *
 * Errors are logged but never thrown — caller should fire-and-forget via
 * Next.js `after()` so the user's HTTP response isn't blocked by the
 * AI work.
 */
export async function sendPreviewDigest(userId: string): Promise<void> {
  // Idempotency: if we've sent a digest before, skip. Catches re-entry from
  // a user re-saving their query later, or from a duplicate route-handler call.
  const existingDigest = await db.digest.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (existingDigest) {
    log.info({ userId }, "[preview-digest] user already has a digest — skipping");
    return;
  }

  log.info({ userId }, "[preview-digest] starting");

  const relevance = await runRelevanceForUser(userId);
  if (!relevance) {
    log.warn(
      { userId },
      "[preview-digest] relevance pipeline returned null — user not digest-ready",
    );
    return;
  }

  const run = await db.digestRun.create({
    data: { runDate: new Date(), status: "running" },
  });

  try {
    const result = await assembleAndSendDigest(userId, run.id, relevance);
    await db.digestRun.update({
      where: { id: run.id },
      data: { status: "done", completedAt: new Date(), userCount: 1 },
    });
    log.info(
      { userId, runId: run.id, daCount: result.daCount, emailStatus: result.emailStatus },
      "[preview-digest] sent",
    );
  } catch (err) {
    await db.digestRun
      .update({
        where: { id: run.id },
        data: { status: "failed", completedAt: new Date() },
      })
      .catch(() => {
        /* best-effort */
      });
    log.error({ userId, err }, "[preview-digest] failed");
  }
}
