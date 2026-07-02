"use client";

// Landing-page waitlist form (issue #25). Captures out-of-scope (trade, region)
// demand — a Melbourne roofer or a Sydney plumber lands here instead of falling
// off the funnel. POSTs to /api/waitlist. Pure demand instrument: no product
// promise beyond "we'll email you when it opens", no confirmation email.
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Status = "idle" | "submitting" | "done" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [trade, setTrade] = useState("");
  const [region, setRegion] = useState("");
  // Honeypot — hidden from real users; bots fill it and get silently dropped.
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<{ trade: string; region: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("submitting");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, trade, region, company, source: "landing" }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? "Something went wrong. Please try again.");
        setStatus("error");
        return;
      }
      setConfirmed({ trade: trade.trim(), region: region.trim() });
      setStatus("done");
    } catch {
      setError("Network error. Please try again.");
      setStatus("error");
    }
  }

  if (status === "done" && confirmed) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="rounded-md bg-[#ECFDF5] border border-[#A7F3D0] text-[#065F46] text-sm px-4 py-3 max-w-md"
      >
        Thanks — we&apos;ll email you when <strong>{confirmed.trade}</strong> in{" "}
        <strong>{confirmed.region}</strong> opens.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 max-w-md" noValidate>
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md bg-[#FEE2E2] text-[#7F1D1D] text-sm px-4 py-3"
        >
          {error}
        </div>
      )}

      <div>
        <label htmlFor="waitlist-email" className="sr-only">
          Email
        </label>
        <Input
          id="waitlist-email"
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="waitlist-trade" className="sr-only">
            Your trade
          </label>
          <Input
            id="waitlist-trade"
            type="text"
            name="trade"
            required
            maxLength={80}
            placeholder="Your trade (e.g. plumbing)"
            value={trade}
            onChange={(e) => setTrade(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="waitlist-region" className="sr-only">
            Your region
          </label>
          <Input
            id="waitlist-region"
            type="text"
            name="region"
            required
            maxLength={80}
            placeholder="Your city (e.g. Melbourne)"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
          />
        </div>
      </div>

      {/* Honeypot: off-screen, hidden from assistive tech + tab order. */}
      <div aria-hidden="true" className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor="waitlist-company">Company (leave blank)</label>
        <input
          id="waitlist-company"
          type="text"
          name="company"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
      </div>

      <Button type="submit" variant="secondary" size="lg" disabled={status === "submitting"}>
        {status === "submitting" ? "Adding you…" : "Join the waitlist"}
      </Button>
    </form>
  );
}
