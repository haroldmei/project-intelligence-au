"use client";

import React, { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { LGABadge } from "@/components/lga-badge";
import { LeadClassBadge } from "@/components/lead-class-badge";
import { ConstructionCertBadge } from "@/components/construction-cert-badge";
import { RelevanceDots } from "@/components/relevance-dots";
import type { LeadClass } from "@/modules/relevance/lead-class";

export interface DACardProps {
  daId: string;
  address: string;
  lga: string;
  relevanceScore: number; // 0–10
  leadClass?: LeadClass;
  // ISO yyyy-mm-dd a Construction Certificate was issued against this DA (issue
  // #13). Present → the "CC issued — work starting" badge renders. Null/undefined
  // for the vast majority of leads (no CC yet, or the PCC feed is off).
  constructionCertifiedAt?: string | null;
  estimatedValue?: number | null; // AUD; null = not disclosed
  whyMatched: string;
  scopeText: string;
  applicantName?: string | null;
  portalUrl: string;
  initialFeedback?: "up" | "down" | null;
}

type Feedback = "up" | "down" | null;

export function DACard({
  daId,
  address,
  lga,
  relevanceScore,
  leadClass,
  constructionCertifiedAt,
  estimatedValue,
  whyMatched,
  scopeText,
  applicantName,
  portalUrl,
  initialFeedback = null,
}: DACardProps) {
  const [feedback, setFeedback] = useState<Feedback>(initialFeedback);
  const [undoQueue, setUndoQueue] = useState<Feedback>(null);
  const [isPending, startTransition] = useTransition();
  const [liveMessage, setLiveMessage] = useState("");
  // Visible error affordance (issue #59): a failed feedback POST must show a
  // sighted tradie something, not just announce to a screen reader.
  const [errorMessage, setErrorMessage] = useState("");

  const formattedValue = estimatedValue
    ? `Est. AUD ${Number(estimatedValue).toLocaleString("en-AU")}`
    : "Value not disclosed";

  function handleThumb(clicked: "up" | "down") {
    const next: Feedback = feedback === clicked ? null : clicked;
    const prev = feedback;

    // Optimistic update
    setFeedback(next);
    setErrorMessage("");
    setLiveMessage(
      next === "up"
        ? `Thumbs up recorded for ${address}`
        : next === "down"
        ? `Thumbs down recorded for ${address}`
        : `Feedback removed for ${address}`
    );

    // Undo toast for 5 seconds
    setUndoQueue(prev);
    setTimeout(() => setUndoQueue(null), 5000);

    startTransition(async () => {
      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            da_id: daId,
            feedback: next === null ? "remove" : next,
          }),
        });
        // fetch only rejects on network failure, not on 4xx/5xx — treat a
        // non-OK response as a failure too so the error affordance shows.
        if (!res.ok) throw new Error(`feedback POST failed: ${res.status}`);
      } catch {
        // Revert on failure and surface a visible error (issue #59). role="alert"
        // announces to screen readers, so we clear the polite live region to
        // avoid a double announcement.
        setFeedback(prev);
        setUndoQueue(null);
        setLiveMessage("");
        setErrorMessage("Couldn't save that — tap again to retry");
      }
    });
  }

  function handleUndo() {
    const prev = undoQueue;
    setFeedback(prev);
    setUndoQueue(null);
    startTransition(async () => {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          da_id: daId,
          feedback: prev === null ? "remove" : prev,
        }),
      });
    });
  }

  return (
    <article
      className={cn(
        "relative rounded-md border border-[#E5E5E5] bg-white shadow-sm p-4 flex flex-col gap-2 transition-all duration-[150ms]",
        feedback === "up" && "border-l-4 border-l-[#16A34A]",
        feedback === "down" && "border-l-4 border-l-[#D4D4D4] opacity-75"
      )}
      aria-label={`DA at ${address}`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <LGABadge label={lga} />
          {leadClass && <LeadClassBadge leadClass={leadClass} />}
          {constructionCertifiedAt && (
            <ConstructionCertBadge issuedDate={constructionCertifiedAt} />
          )}
        </div>
        <RelevanceDots score={relevanceScore} />
      </div>

      {/* Address */}
      <h2 className="text-lg font-medium text-[#102A43] leading-snug">
        {address}
      </h2>

      {/* Value */}
      <p className="text-sm text-[#627D98]">{formattedValue}</p>

      {/* Why matched */}
      <p className="text-sm italic text-[#486581]">{whyMatched}</p>

      {/* Scope */}
      <p className="text-sm text-[#404040] leading-relaxed line-clamp-3">
        {scopeText}
      </p>

      {/* Applicant */}
      {applicantName && (
        <p className="text-xs text-[#A3A3A3]">Applicant: {applicantName}</p>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-[#F5F5F5]">
        <a
          href={portalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-[#1E3A5F] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-1 rounded min-h-[44px] flex items-center pr-2"
          aria-label={`View DA application for ${address} on council portal`}
        >
          View DA →
        </a>

        <div className="flex items-center gap-1">
          {/* Thumb up */}
          <button
            type="button"
            onClick={() => handleThumb("up")}
            disabled={isPending}
            aria-label={`Thumb up for ${address}`}
            aria-pressed={feedback === "up"}
            className={cn(
              "min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full transition-all duration-[150ms] active:scale-95",
              feedback === "up"
                ? "bg-green-100"
                : "hover:bg-green-50"
            )}
          >
            <span
              className={cn(
                "text-xl leading-none",
                feedback === "up" ? "text-green-700" : "text-[#A3A3A3]"
              )}
              aria-hidden="true"
            >
              {feedback === "up" ? "✓" : "👍"}
            </span>
          </button>

          {/* Thumb down */}
          <button
            type="button"
            onClick={() => handleThumb("down")}
            disabled={isPending}
            aria-label={`Thumb down for ${address}`}
            aria-pressed={feedback === "down"}
            className={cn(
              "min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full transition-all duration-[150ms] active:scale-95",
              feedback === "down"
                ? "bg-red-100"
                : "hover:bg-red-50"
            )}
          >
            <span
              className={cn(
                "text-xl leading-none",
                feedback === "down" ? "text-red-700" : "text-[#A3A3A3]"
              )}
              aria-hidden="true"
            >
              {feedback === "down" ? "✓" : "👎"}
            </span>
          </button>
        </div>
      </div>

      {/* Visible error affordance when a feedback POST fails (issue #59).
          role="alert" is both visible here and announced assertively to
          screen readers, replacing the sr-only-only error. */}
      {errorMessage && (
        <p
          role="alert"
          className="mt-1 text-sm font-medium text-[#B91C1C]"
        >
          {errorMessage}
        </p>
      )}

      {/* Screen-reader live region for feedback state */}
      <span aria-live="polite" className="sr-only">
        {liveMessage}
      </span>

      {/* Undo toast */}
      {undoQueue !== undefined && undoQueue !== feedback && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-2 left-0 right-0 mx-4 flex items-center justify-between bg-[#102A43] text-white text-xs rounded px-3 py-2 shadow-md"
        >
          <span>Feedback saved</span>
          <button
            type="button"
            onClick={handleUndo}
            className="underline hover:no-underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#D97706] rounded"
          >
            Undo
          </button>
        </div>
      )}
    </article>
  );
}
