// Behaviour lock for the roofing Stage-1 rule pass.
//
// filters.ts builds its tsquery from the roofing pack's vocabulary. This test
// pins packTsQuery(roofingPack) to an exact string so the generated Postgres
// query never changes by accident. If the vocabulary is edited, this
// expectation must be updated deliberately (it is the behaviour contract).
//
// The string below started as the #27 byte-for-byte copy of the pre-extraction
// ROOFING_KEYWORDS tsquery; #10 appended the CDC re-roof signals
// (roof<->cladding … re-sheet) after `rooflight`, immediately before the
// implicit tier.
import { describe, expect, it } from "vitest";
import { packTsQuery } from "../types";
import { roofingPack } from "./pack";

const EXPECTED_TSQUERY =
  "roof | roofing | re-roof | reroof | metal<->roof | colorbond | colour<->bond | membrane | gutters | downpipes | skylights | roof<->tiles | roof<->replacement | roof<->restoration | roof<->repair | insulation | fascia | barge | ridge<->cap | hip<->and<->ridge | sarking | rooflight | roof<->cladding | replacement<->roof<->cladding | colorbond<->conversion | metal<->deck | recladding | re-sheet | dwelling | residential | alterations | additions | alterations<->and<->additions | construction<->of | single<->storey | two<->storey | dual<->occupancy | secondary<->dwelling";

describe("packTsQuery(roofingPack)", () => {
  it("reproduces the pinned roofing tsquery byte-for-byte", () => {
    expect(packTsQuery(roofingPack)).toBe(EXPECTED_TSQUERY);
  });

  it("keeps both tiers in the vocabulary (explicit + implicit)", () => {
    expect(roofingPack.vocabulary.explicit).toContain("colorbond");
    expect(roofingPack.vocabulary.explicit).toContain("roof");
    expect(roofingPack.vocabulary.implicit).toContain("dwelling");
  });

  it("carries the CDC re-roof signals (#10)", () => {
    expect(roofingPack.vocabulary.explicit).toContain("roof cladding");
    expect(roofingPack.vocabulary.explicit).toContain("replacement roof cladding");
    expect(roofingPack.vocabulary.explicit).toContain("colorbond conversion");
    expect(packTsQuery(roofingPack)).toContain("replacement<->roof<->cladding");
  });
});
