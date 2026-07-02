// Jurisdiction adapter registry — the single place that knows which statewide
// feeds are active. Expansion Wave 2 (docs/25 §2/§4).
//
// NSW is the incumbent, served by the per-council dispatcher in sources.ts;
// this registry governs the ADDITIONAL statewide jurisdictions layered on top.
// Each is gated behind its own env flag, default off, so a jurisdiction adapter
// can be built, merged, and fixture-tested while the launch decision stays
// human-owned (SA's is blocked on the PlanSA license question — docs/25 §6).
//
// FLAG READING: flags are read from `process.env` at CALL TIME, not from the
// frozen `@/lib/env` snapshot (which is parsed once at import and, being
// server-only, throws in a jsdom test). Reading live makes the flag a genuine
// runtime switch and lets a single test toggle it. The flag is still DECLARED
// in @/lib/env for prod-config validation and .env.production.example.
import type { JurisdictionAdapter } from "./types";
import { saAdapter } from "./sa";

interface Registration {
  adapter: JurisdictionAdapter;
  /** Env flag that must be truthy for the adapter to be active. */
  flag: string;
}

const REGISTRY: Registration[] = [
  // South Australia (PlanSA). DORMANT — do not enable until the commercial-use
  // license question (docs/25 §6) is closed.
  { adapter: saAdapter, flag: "SA_INGEST_ENABLED" },
];

/**
 * Read a boolean feature flag from the live environment. Strict truthiness
 * ("true" / "1") — deliberately narrower than z.coerce.boolean (which treats
 * any non-empty string, including "false", as true) so a stray value can't
 * silently switch on a jurisdiction.
 */
export function isFlagEnabled(name: string): boolean {
  const v = process.env[name];
  return v === "true" || v === "1";
}

/**
 * Jurisdiction adapters active given the live flag state. With every flag off
 * this is `[]`, so the ingest loop over it is a no-op and behaviour is
 * byte-identical to the NSW-only pipeline.
 */
export function getEnabledJurisdictionAdapters(): JurisdictionAdapter[] {
  return REGISTRY.filter(({ flag }) => isFlagEnabled(flag)).map((r) => r.adapter);
}
