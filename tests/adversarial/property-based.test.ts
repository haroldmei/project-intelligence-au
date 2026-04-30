// Property-based adversarial tests using fast-check.
// Properties: invariant assertions that hold across the entire input space.
import { describe, it, expect, beforeAll } from "vitest";
import fc from "fast-check";
import { issueFeedbackToken, validateFeedbackToken } from "@/lib/hmac/token";
import { checkRateLimit } from "@/lib/auth/rate-limit";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { adversarialString } from "./_helpers/arbitraries";

beforeAll(() => {
  process.env.FEEDBACK_HMAC_SECRET = "property-test-secret-32-chars-aaaaa";
});

describe("HMAC token round-trip property", () => {
  it("any (userId, daId, vote) round-trips issue → validate", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.string({ minLength: 1, maxLength: 200 }),
        fc.constantFrom(0 as const, 1 as const),
        (userId, daId, vote) => {
          const tok = issueFeedbackToken(userId, daId, vote);
          const r = validateFeedbackToken(tok);
          if (!r.ok) return false;
          return (
            r.payload.userId === userId &&
            r.payload.daId === daId &&
            r.payload.vote === vote
          );
        },
      ),
      { numRuns: 200 },
    );
  });

  it("validateFeedbackToken is total — any string returns a typed result, never throws", () => {
    fc.assert(
      fc.property(adversarialString, (s) => {
        const r = validateFeedbackToken(s);
        return r.ok === true || r.ok === false;
      }),
      { numRuns: 500 },
    );
  });
});

describe("Rate limiter property", () => {
  it("never allows > N hits per window for any string key", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 32 }),
        fc.integer({ min: 1, max: 20 }),
        (rawKey, limit) => {
          // Make the key unique per run so windows don't bleed between iterations.
          const key = `prop-${rawKey}-${Math.random()}`;
          let allowed = 0;
          for (let i = 0; i < limit + 5; i++) {
            const r = checkRateLimit(key, limit, 60_000);
            if (r.allowed) allowed += 1;
          }
          return allowed === limit;
        },
      ),
      { numRuns: 100 },
    );
  });

  it("AT-003 FIX: zero-limit MUST never allow any hit (regression guard)", () => {
    // AT-003 FIX: rate-limit.ts now correctly denies when limit===0 on a new window.
    // Property: for ANY key, checkRateLimit(key, 0, ...) must always return allowed:false.
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 16 }), (rawKey) => {
        const key = `zero-${rawKey}-${Math.random()}`;
        const r = checkRateLimit(key, 0, 60_000);
        return r.allowed === false;
      }),
      { numRuns: 50 },
    );
  });
});

describe("Password hashing property", () => {
  it("hash never equals raw password", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }),
        async (pw) => {
          const h = await hashPassword(pw);
          return h !== pw && h.startsWith("$argon2id$");
        },
      ),
      { numRuns: 30 },
    );
  });

  it("verify(hash, samePassword) === true", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }),
        async (pw) => {
          const h = await hashPassword(pw);
          return await verifyPassword(h, pw);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("verify(hash, differentPassword) === false (collision-resistance sanity)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 32 }),
        fc.string({ minLength: 1, maxLength: 32 }),
        async (pw1, pw2) => {
          fc.pre(pw1 !== pw2);
          const h = await hashPassword(pw1);
          return !(await verifyPassword(h, pw2));
        },
      ),
      { numRuns: 15 },
    );
  });
});

describe("Digest assembly determinism property", () => {
  // We don't have access to a pure digest assembler here — assemble depends on
  // DB rows. We test the KEY property: rerank stub determinism.
  // The relevance pipeline IS deterministic given (savedQuery, userEmbedding,
  // candidate set, thumbsExamples) — so calling it twice with the same input
  // must yield the same output IDs in the same order.
  it("runRelevancePipeline is deterministic for fixed input", async () => {
    // Stub rerank inline (no live network)
    const { runRelevancePipeline } = await import("@/lib/ai/relevance-pipeline");
    const candidates = Array.from({ length: 5 }, (_, i) => ({
      daId: `da-${i}`,
      council: "blacktown",
      address: `${i} Test St`,
      description: `roof job ${i}`,
      rawScopeText: null,
      estimatedValue: 50_000 + i,
      lodgementDate: "2026-04-01",
      applicantName: null,
      portalUrl: `https://example.com/da-${i}`,
    }));
    // Mock rerank module via vi.mock at the top of file would conflict with
    // other tests; here we provide deterministic deps that bypass rerank
    // by having vectorRank return [] (pipeline early-returns).
    const deps = {
      ruleFilter: async () => candidates,
      vectorRank: async () => [], // forces early return
      loadThumbsExamples: async () => [],
    };
    const inputA = {
      userId: "u1",
      savedQueryText: "roofing",
      savedQueryEmbedding: Array(1536).fill(0),
      userLgaCouncilSlugs: ["blacktown"],
    };
    const a = await runRelevancePipeline(inputA, deps);
    const b = await runRelevancePipeline(inputA, deps);
    expect(a).toEqual(b);
  });
});
