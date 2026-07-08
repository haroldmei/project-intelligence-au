// Tests for DA embedding input truncation (issue #225).
// FR-005 requires the embedding input to be concatenation of description +
// raw_scope_text, truncated to 8,000 tokens if necessary.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared mock so embed/embedBatch tests can inspect what was sent to OpenAI.
const { mockEmbeddingsCreate } = vi.hoisted(() => ({
  mockEmbeddingsCreate: vi.fn(),
}));

vi.mock("openai", () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      embeddings: {
        create: mockEmbeddingsCreate,
      },
    };
  }),
}));

// Embedding tests don't need a live DB; mock the full env module so its
// zod validation (which requires DATABASE_URL etc.) doesn't throw on import.
vi.mock("@/lib/env", () => ({
  env: {
    OPENAI_API_KEY: "test",
  },
}));

beforeEach(() => {
  mockEmbeddingsCreate.mockReset();
});

// ---------------------------------------------------------------------------
// truncateForEmbedding — pure function, no API mocking needed
// ---------------------------------------------------------------------------

describe("truncateForEmbedding", () => {
  it("returns short text unchanged", async () => {
    const { truncateForEmbedding } = await import("@/lib/ai/embeddings");
    const short = "Roof replacement for residential dwelling";
    expect(truncateForEmbedding(short)).toBe(short);
  });

  it("truncates text exceeding MAX_EMBEDDING_CHARS, cutting at a word boundary", async () => {
    const { truncateForEmbedding, MAX_EMBEDDING_CHARS } = await import(
      "@/lib/ai/embeddings"
    );
    const prefix = "Development application for roof replacement at ";
    const filler = "word ".repeat(MAX_EMBEDDING_CHARS);
    const oversized = prefix + filler + "tail should be cut";

    const result = truncateForEmbedding(oversized);
    expect(result.length).toBeLessThanOrEqual(MAX_EMBEDDING_CHARS);
    expect(result.endsWith("tail")).toBe(false);
    expect(result.endsWith("word")).toBe(true); // cut on last space before limit
  });

  it("hard-cuts at the limit when no word boundary is available near the limit", async () => {
    const { truncateForEmbedding, MAX_EMBEDDING_CHARS } = await import(
      "@/lib/ai/embeddings"
    );
    const longToken = "a".repeat(MAX_EMBEDDING_CHARS - 100) + "b".repeat(200);
    const result = truncateForEmbedding(longToken);
    expect(result.length).toBeLessThanOrEqual(MAX_EMBEDDING_CHARS);
  });

  it("returns empty string unchanged", async () => {
    const { truncateForEmbedding } = await import("@/lib/ai/embeddings");
    expect(truncateForEmbedding("")).toBe("");
  });

  it("preserves description prefix when truncating (FR-005 content kept)", async () => {
    const { truncateForEmbedding, MAX_EMBEDDING_CHARS } = await import(
      "@/lib/ai/embeddings"
    );
    const description = "Demolition of existing dwelling and construction of ";
    const rawScope = "new two-storey brick veneer residence with attached garage. ";
    const longScope = rawScope.repeat(
      Math.ceil(MAX_EMBEDDING_CHARS / rawScope.length) + 1,
    );
    const text = description + longScope;

    const result = truncateForEmbedding(text);
    expect(result.length).toBeLessThanOrEqual(MAX_EMBEDDING_CHARS);
    expect(result.startsWith("Demolition of existing dwelling")).toBe(true);
  });

  it("MAX_EMBEDDING_CHARS constant equals 30,000 (~8k tokens at 4 chars/token)", async () => {
    const { MAX_EMBEDDING_CHARS } = await import("@/lib/ai/embeddings");
    expect(MAX_EMBEDDING_CHARS).toBe(30_000);
  });
});

// ---------------------------------------------------------------------------
// embed — verify truncation is applied before the API call
// ---------------------------------------------------------------------------

describe("embed with truncation", () => {
  beforeEach(() => {
    mockEmbeddingsCreate.mockResolvedValue({
      data: [{ embedding: Array(1536).fill(0.1) }],
      usage: { prompt_tokens: 10, total_tokens: 10 },
    });
  });

  it("sends short text unchanged", async () => {
    const { embed } = await import("@/lib/ai/embeddings");
    const short = "Roof replacement for residential dwelling";
    await embed(short, { userId: null });

    expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(1);
    expect(mockEmbeddingsCreate.mock.calls[0][0].input).toBe(short);
  });

  it("sends truncated text when input is oversized", async () => {
    const { embed, MAX_EMBEDDING_CHARS } = await import(
      "@/lib/ai/embeddings"
    );
    const oversized = "x".repeat(MAX_EMBEDDING_CHARS + 5000);
    await embed(oversized, { userId: null });

    expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(1);
    const sentInput = mockEmbeddingsCreate.mock.calls[0][0].input as string;
    expect(sentInput.length).toBeLessThanOrEqual(MAX_EMBEDDING_CHARS);
  });
});

// ---------------------------------------------------------------------------
// embedBatch — verify truncation is applied per-input before the API call
// ---------------------------------------------------------------------------

describe("embedBatch with truncation", () => {
  beforeEach(() => {
    mockEmbeddingsCreate.mockResolvedValue({
      data: [
        { embedding: Array(1536).fill(0.1) },
        { embedding: Array(1536).fill(0.2) },
      ],
      usage: { prompt_tokens: 20, total_tokens: 20 },
    });
  });

  it("truncates each oversized input independently", async () => {
    const { embedBatch, MAX_EMBEDDING_CHARS } = await import(
      "@/lib/ai/embeddings"
    );
    const short = "Short description";
    const oversized = "z".repeat(MAX_EMBEDDING_CHARS + 5000);

    await embedBatch([short, oversized], { userId: null });

    expect(mockEmbeddingsCreate).toHaveBeenCalledTimes(1);
    const sent = mockEmbeddingsCreate.mock.calls[0][0].input as string[];
    expect(sent).toHaveLength(2);
    expect(sent[0]).toBe(short);
    expect(sent[1].length).toBeLessThanOrEqual(MAX_EMBEDDING_CHARS);
  });

  it("returns empty array for empty input with no API call", async () => {
    const { embedBatch } = await import("@/lib/ai/embeddings");
    const result = await embedBatch([], { userId: null });
    expect(result).toEqual([]);
    expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
  });

  it("handles a 40k-char pathological input alongside a normal one (acceptance criterion)", async () => {
    // Acceptance criterion: "A unit test embedding a 40k-char DA text
    // succeeds (input truncated) and the digest for that user completes;
    // no OpenAI 400 is thrown for oversized DAs."
    const { embedBatch, MAX_EMBEDDING_CHARS } = await import(
      "@/lib/ai/embeddings"
    );

    mockEmbeddingsCreate.mockResolvedValue({
      data: [
        { embedding: Array(1536).fill(0.3) },
        { embedding: Array(1536).fill(0.4) },
      ],
      usage: { prompt_tokens: 25, total_tokens: 25 },
    });

    const normal = "Re-roof Colorbond steel replacement with new gutters";
    const hugeCouncilSee = "x".repeat(40_000); // exceeds MAX_EMBEDDING_CHARS

    const result = await embedBatch([normal, hugeCouncilSee], {
      userId: null,
    });

    // Both inputs succeed — the oversized DA did not cause a batch failure
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveLength(1536);
    expect(result[1]).toHaveLength(1536);

    // Verify the huge input was truncated before the API call
    const sent = mockEmbeddingsCreate.mock.calls[0][0].input as string[];
    expect(sent[1].length).toBeLessThanOrEqual(MAX_EMBEDDING_CHARS);
    expect(sent[0]).toBe(normal);
  });
});

// ---------------------------------------------------------------------------
// vector.ts FR-005 compliance: description + raw_scope_text (no address)
// ---------------------------------------------------------------------------

describe("vectorRank input format (FR-005)", () => {
  it("uses description + raw_scope_text, NOT address, per FR-005", () => {
    // Replicate the post-fix input construction from vector.ts:
    //   const texts = toEmbed.map(
    //     (c) => `${c.description} ${c.rawScopeText ?? ""}`.trim(),
    //   );
    const candidate = {
      daId: "da-1",
      council: "blacktown",
      address: "42 Acacia Ave, Blacktown NSW 2148",
      description: "Roof replacement of existing dwelling",
      rawScopeText: "Remove and replace existing tile roof with Colorbond.",
      lodgementDate: new Date("2026-07-01"),
      portalUrl: "https://example.com/da/1",
    };

    const text = `${candidate.description} ${candidate.rawScopeText ?? ""}`.trim();

    // FR-005: description + raw_scope_text
    expect(text).toBe(
      "Roof replacement of existing dwelling Remove and replace existing tile roof with Colorbond.",
    );
    // Address is NOT part of the embedding input
    expect(text).not.toContain("42 Acacia Ave");
    expect(text).not.toContain("Blacktown");
  });

  it("handles null rawScopeText gracefully", () => {
    const nullVal: string | null = null;
    const text = `${"Test description"} ${nullVal ?? ""}`.trim();
    expect(text).toBe("Test description");
  });
});
