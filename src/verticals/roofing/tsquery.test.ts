// #27 zero-behaviour-change lock for the roofing Stage-1 rule pass.
//
// filters.ts now builds its tsquery from the roofing pack's vocabulary. This
// test pins packTsQuery(roofingPack) to the exact string the old hardcoded
// ROOFING_KEYWORDS array produced, so the generated Postgres query is
// unchanged. If the vocabulary is edited, this expectation must be updated
// deliberately (it is the behaviour contract).
import { describe, expect, it } from "vitest";
import { packTsQuery } from "../types";
import { roofingPack } from "./pack";

// The original tsquery emitted by buildTsQuery() before the extraction.
const ORIGINAL_TSQUERY =
  "roof | roofing | re-roof | reroof | metal<->roof | colorbond | colour<->bond | membrane | gutters | downpipes | skylights | roof<->tiles | roof<->replacement | roof<->restoration | roof<->repair | insulation | fascia | barge | ridge<->cap | hip<->and<->ridge | sarking | rooflight | dwelling | residential | alterations | additions | alterations<->and<->additions | construction<->of | single<->storey | two<->storey | dual<->occupancy | secondary<->dwelling";

describe("packTsQuery(roofingPack) — zero behaviour change", () => {
  it("reproduces the pre-extraction ROOFING_KEYWORDS tsquery byte-for-byte", () => {
    expect(packTsQuery(roofingPack)).toBe(ORIGINAL_TSQUERY);
  });

  it("keeps both tiers in the vocabulary (explicit + implicit)", () => {
    expect(roofingPack.vocabulary.explicit).toContain("colorbond");
    expect(roofingPack.vocabulary.explicit).toContain("roof");
    expect(roofingPack.vocabulary.implicit).toContain("dwelling");
  });
});
