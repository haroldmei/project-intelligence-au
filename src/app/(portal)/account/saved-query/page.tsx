"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const MIN = 5;
const MAX = 500;

export default function SavedQueryPage() {
  const [text, setText] = useState("");
  const [original, setOriginal] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/account/saved-query")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as { saved_query_text: string | null };
      })
      .then((data) => {
        if (cancelled) return;
        setText(data.saved_query_text ?? "");
        setOriginal(data.saved_query_text ?? "");
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Couldn't load your search query. Refresh to retry.");
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setValidationError(null);
    const trimmed = text.trim();
    if (trimmed.length < MIN) {
      setValidationError(`At least ${MIN} characters.`);
      return;
    }
    if (trimmed.length > MAX) {
      setValidationError(`At most ${MAX} characters.`);
      return;
    }
    if (trimmed === original.trim()) {
      setToast("No changes to save.");
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setIsSaving(true);
    try {
      const res = await fetch("/api/account/saved-query", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saved_query_text: trimmed }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: unknown };
        const msg =
          typeof body.error === "string"
            ? body.error
            : res.status === 429
              ? "Too many edits — please wait a few minutes and try again."
              : "Save failed. Please try again.";
        setToast(msg);
      } else {
        setOriginal(trimmed);
        setToast("Saved. Re-running relevance — your next digest will reflect the change.");
      }
    } catch {
      setToast("Network error. Please try again.");
    } finally {
      setIsSaving(false);
      setTimeout(() => setToast(null), 5000);
    }
  }

  const remaining = MAX - text.length;
  const dirty = text.trim() !== original.trim();

  return (
    <div className="px-4 py-6 space-y-6 max-w-xl">
      <div className="flex items-center gap-2">
        <Link
          href="/account"
          aria-label="Back to account settings"
          className="text-[#627D98] hover:text-[#1E3A5F] min-h-[44px] flex items-center pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] rounded"
        >
          ← Account
        </Link>
        <h1 className="text-xl font-semibold text-[#102A43]">Search query</h1>
      </div>

      {error && (
        <div role="alert" aria-live="assertive" className="rounded-md bg-[#FEE2E2] text-[#7F1D1D] text-sm px-4 py-3">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="bg-white rounded-md border border-[#E5E5E5] px-4 py-4 space-y-3">
        <label htmlFor="saved-query" className="block text-sm font-semibold text-[#102A43]">
          Describe the work you want to win
        </label>
        <p className="text-xs text-[#829AB1]">
          Plain English. The clearer your description, the better the leads we surface.
          Examples: &ldquo;new metal roofs on single-storey homes&rdquo;, &ldquo;commercial waterproofing
          and re-roofing in inner Sydney&rdquo;.
        </p>
        <textarea
          id="saved-query"
          rows={5}
          disabled={!loaded || isSaving}
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="w-full rounded-md border border-[#D4D4D4] px-3 py-2 text-sm text-[#102A43] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] disabled:opacity-50 resize-y"
          aria-invalid={validationError ? true : undefined}
          aria-describedby={validationError ? "saved-query-error" : "saved-query-hint"}
        />
        <div className="flex items-center justify-between text-xs">
          {validationError ? (
            <p id="saved-query-error" className="text-[#7F1D1D]">{validationError}</p>
          ) : (
            <p id="saved-query-hint" className="text-[#829AB1]">
              {remaining < 0
                ? `${-remaining} over the ${MAX}-character limit`
                : `${remaining} characters remaining`}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={!loaded || isSaving || !dirty}
          className="inline-flex items-center justify-center font-semibold rounded-md transition-all duration-[150ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D97706] focus-visible:ring-offset-2 active:scale-95 bg-[#D97706] text-white hover:bg-[#B45309] min-h-[44px] h-12 px-6 text-base disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </form>

      {toast && (
        <div role="status" aria-live="polite" className="text-sm text-[#14532D] bg-[#DCFCE7] rounded-md px-4 py-3">
          {toast}
        </div>
      )}
    </div>
  );
}
