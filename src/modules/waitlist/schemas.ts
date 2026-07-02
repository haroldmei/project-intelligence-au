// Waitlist demand-capture schema + normalisation (issue #25, expansion Wave 0).
// Imported by the API route AND the landing-page form. contract.backend.validators = zod 3.
import { z } from "zod";

/** Where a waitlist submission originated. Stored verbatim for funnel analysis. */
export const WAITLIST_SOURCES = ["landing", "signup"] as const;

export const WaitlistInput = z.object({
  email: z
    .string()
    .email("Invalid email address.")
    .max(254, "Email must be at most 254 characters (RFC 5321)."),
  // Free-text short strings — deliberately not an enum: the whole point is to
  // measure demand for trades/regions we do NOT yet support.
  trade: z.string().trim().min(1, "Trade is required.").max(80, "Trade must be at most 80 characters."),
  region: z.string().trim().min(1, "Region is required.").max(80, "Region must be at most 80 characters."),
  note: z.string().trim().max(500, "Note must be at most 500 characters.").optional(),
  source: z.enum(WAITLIST_SOURCES).default("landing"),
  // Honeypot — a hidden field real users never see. Any non-empty value means a
  // bot; the route silently drops the submission. Kept optional + unconstrained
  // so a bot filling it still passes validation (we want to look successful).
  company: z.string().max(200).optional(),
});
export type WaitlistInput = z.infer<typeof WaitlistInput>;

/** True when the honeypot field was filled — i.e. the submitter is a bot. */
export function isHoneypotTripped(input: WaitlistInput): boolean {
  return !!input.company && input.company.trim().length > 0;
}

/**
 * Normalise a validated submission into the row we persist. Lowercasing email
 * (mirrors the DB citext column) and trade/region guarantees dedupe on the
 * (email, trade, region) unique index regardless of how the user typed them.
 * The honeypot field is dropped here — it is never stored.
 */
export function normalizeWaitlistEntry(input: WaitlistInput): {
  email: string;
  trade: string;
  region: string;
  note: string | null;
  source: (typeof WAITLIST_SOURCES)[number];
} {
  return {
    email: input.email.toLowerCase().trim(),
    trade: input.trade.trim().toLowerCase(),
    region: input.region.trim().toLowerCase(),
    note: input.note?.trim() ? input.note.trim() : null,
    source: input.source,
  };
}
