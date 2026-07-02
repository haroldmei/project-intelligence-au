// Vertical pack registry — the single place that knows which trades exist and
// which are active. WEDGE expansion: docs/25 §2.
//
// Each trade beyond roofing (V1) is gated behind its own env flag, default off,
// so a pack can be built, merged, and eval-seeded while the launch decision
// stays human-owned. Flipping the flag activates the pack; nothing else changes.
//
// FLAG READING: flags are read from `process.env` at CALL TIME, not from the
// frozen `@/lib/env` snapshot. That snapshot is parsed once at import, so a
// single process (or a single test) could never toggle it. Reading live lets a
// test enable the flag and exercise the full pipeline, and lets the flag be a
// genuine runtime switch. The flag is still DECLARED in @/lib/env for prod-
// config validation and .env.production.example generation.
import type { VerticalPack } from "./types";
import { roofingPack } from "./roofing";
import { demolitionPack } from "./demolition";

interface Registration {
  pack: VerticalPack;
  /** Env flag that must be truthy for the pack to be active. Omit = always on. */
  flag?: string;
}

const REGISTRY: Registration[] = [
  { pack: roofingPack }, // V1 baseline — always active
  { pack: demolitionPack, flag: "VERTICAL_DEMOLITION_ENABLED" },
];

/**
 * Read a boolean feature flag from the live environment. Strict truthiness
 * ("true" / "1") — deliberately narrower than z.coerce.boolean (which treats
 * any non-empty string, including "false", as true) so a stray value can't
 * silently launch a trade.
 */
export function isFlagEnabled(name: string): boolean {
  const v = process.env[name];
  return v === "true" || v === "1";
}

/** Packs currently active given the live flag state. */
export function getActivePacks(): VerticalPack[] {
  return REGISTRY.filter(({ flag }) => !flag || isFlagEnabled(flag)).map(
    (r) => r.pack,
  );
}

/** Resolve an active pack by slug, or undefined if it doesn't exist / is gated off. */
export function getPack(slug: string): VerticalPack | undefined {
  return getActivePacks().find((p) => p.slug === slug);
}

/**
 * Resolve a pack by slug regardless of flag state. For build-time tooling and
 * tests that need the dormant pack; NOT for the runtime relevance path (use
 * `getPack`, which respects the flag).
 */
export function getRegisteredPack(slug: string): VerticalPack | undefined {
  return REGISTRY.find((r) => r.pack.slug === slug)?.pack;
}

/** Every registered pack slug, active or not. */
export function registeredSlugs(): string[] {
  return REGISTRY.map((r) => r.pack.slug);
}
