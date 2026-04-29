"use client";

// Onboarding step 4 of 5 — saved-query capture.
// FR-005 / FR-015: per-user query is embedded once and used for vector
// similarity in every Sunday digest. Without this step the digest cron
// silently skips the user (runRelevanceForUser returns null when
// saved_query_embedding IS NULL).

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const DEFAULT_QUERY =
  "Roof replacement, Colorbond or metal deck, residential Sydney, $50k–$300k. Re-roofs over tile or asbestos. Not interested in commercial fitouts, internal renos, or new builds without scope.";

const PLACEHOLDER_QUERY =
  "Re-roofs in Western Sydney, mostly Colorbond replacing concrete tile. Residential, $80k–$250k jobs. Not interested in commercial or anything under $30k.";

const MIN_LENGTH = 5;
const MAX_LENGTH = 500;

export default function QueryPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Pre-fill if the user previously set it (returning to onboarding).
  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/saved-query")
      .then(async (res) => (res.ok ? ((await res.json()) as { saved_query_text: string | null }) : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.saved_query_text) setText(data.saved_query_text);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  function useDefault() {
    setText(DEFAULT_QUERY);
  }

  async function submit(query: string) {
    setServerError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/account/saved-query", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saved_query_text: query }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: unknown };
        const msg = typeof json.error === "string" ? json.error : "Couldn't save your query. Please try again.";
        setServerError(msg);
        return;
      }
      router.push("/plan");
    } catch {
      setServerError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const trimmed = text.trim();
  const tooShort = trimmed.length < MIN_LENGTH;
  const tooLong = trimmed.length > MAX_LENGTH;
  const charCountColour = tooLong ? "text-[#DC2626]" : trimmed.length > MAX_LENGTH * 0.9 ? "text-[#D97706]" : "text-[#829AB1]";

  return (
    <div className="bg-white rounded-xl border border-[#E5E5E5] shadow-sm p-6 space-y-5">
      <div className="flex items-center justify-end text-xs text-[#829AB1]">
        <span>Step 4 of 5</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-[#102A43]">What kind of jobs are you looking for?</h1>
        <p className="text-sm text-[#627D98] mt-1">
          The more specific you are, the better your Sunday digest. Describe scope, materials, value range, and anything to skip.
        </p>
      </div>

      {serverError && (
        <div role="alert" aria-live="assertive" className="rounded-md bg-[#FEE2E2] text-[#7F1D1D] text-sm px-4 py-3">
          {serverError}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="saved-query" className="text-sm font-semibold text-[#334E68]">
          Your job profile
        </label>
        <textarea
          id="saved-query"
          rows={6}
          maxLength={MAX_LENGTH + 50 /* let user type past the cap so we can show the count error */}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={loaded ? PLACEHOLDER_QUERY : "Loading…"}
          disabled={!loaded || isSubmitting}
          aria-describedby="saved-query-help saved-query-count"
          className="w-full rounded-md border border-[#D4D4D4] px-3 py-2 text-sm text-[#102A43] placeholder-[#A3A3A3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] disabled:bg-[#FAFAFA]"
        />
        <div className="flex items-center justify-between">
          <p id="saved-query-help" className="text-xs text-[#627D98]">
            We use this to score every DA each Sunday — only the leads worth your time will be in your digest.
          </p>
          <p id="saved-query-count" className={`text-xs ${charCountColour}`}>
            {trimmed.length} / {MAX_LENGTH}
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={useDefault}
        disabled={isSubmitting}
        className="text-sm text-[#627D98] underline hover:text-[#1E3A5F] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] rounded"
      >
        Use the default — generic Sydney roofing
      </button>

      <Button
        type="button"
        variant="primary"
        size="lg"
        className="w-full"
        onClick={() => submit(trimmed)}
        disabled={!loaded || isSubmitting || tooShort || tooLong}
        aria-busy={isSubmitting}
      >
        {isSubmitting ? "Saving…" : "Continue"}
      </Button>
    </div>
  );
}
