// Unit tests for the storm-brief send-selection + dedupe logic (#20).
// This is the acceptance core: "a fixture warning for 'Sydney Metropolitan'
// produces exactly one brief per affected user" + no double-send.
import { describe, it, expect } from "vitest";
import { selectBriefs, briefKey, type StormBriefUser } from "./select";
import type { StormWarning } from "./types";

function warning(overrides: Partial<StormWarning> = {}): StormWarning {
  return {
    id: "IDN21031",
    type: "severe_thunderstorm",
    title: "Severe Thunderstorm Warning for Sydney Metropolitan",
    issuedAt: new Date("2026-01-15T04:35:00Z"),
    areas: ["Sydney Metropolitan"],
    url: "http://www.bom.gov.au/products/IDN21031.html",
    ...overrides,
  };
}

const sydneyMetro = warning();

describe("selectBriefs", () => {
  it("produces exactly one brief per affected user for a Sydney Metropolitan warning", () => {
    const users: StormBriefUser[] = [
      { id: "u1", email: "a@x.com", subscribedLgaIds: ["blacktown"] },
      { id: "u2", email: "b@x.com", subscribedLgaIds: ["sutherland", "hornsby"] },
    ];

    const tasks = selectBriefs({ warnings: [sydneyMetro], users });

    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.user.id).sort()).toEqual(["u1", "u2"]);
    // Each user appears exactly once.
    const perUser = tasks.filter((t) => t.user.id === "u1");
    expect(perUser).toHaveLength(1);
    // matchedLgaIds is the user's affected subset.
    expect(perUser[0].matchedLgaIds).toEqual(["blacktown"]);
  });

  it("skips users whose LGAs the warning does not affect", () => {
    const warn = warning({ areas: ["near Penrith and Blacktown"] });
    const users: StormBriefUser[] = [
      { id: "u1", email: "a@x.com", subscribedLgaIds: ["penrith"] }, // affected
      { id: "u2", email: "b@x.com", subscribedLgaIds: ["sutherland"] }, // NOT affected
    ];

    const tasks = selectBriefs({ warnings: [warn], users });

    expect(tasks.map((t) => t.user.id)).toEqual(["u1"]);
  });

  it("does not re-send a brief already recorded for that (warning, user)", () => {
    const users: StormBriefUser[] = [
      { id: "u1", email: "a@x.com", subscribedLgaIds: ["blacktown"] },
      { id: "u2", email: "b@x.com", subscribedLgaIds: ["hornsby"] },
    ];
    const alreadySent = new Set([briefKey(sydneyMetro.id, "u1")]);

    const tasks = selectBriefs({ warnings: [sydneyMetro], users, alreadySent });

    // u1 already got it → only u2 remains.
    expect(tasks.map((t) => t.user.id)).toEqual(["u2"]);
  });

  it("re-running with every pair already sent yields no tasks (idempotent)", () => {
    const users: StormBriefUser[] = [
      { id: "u1", email: "a@x.com", subscribedLgaIds: ["blacktown"] },
    ];
    const first = selectBriefs({ warnings: [sydneyMetro], users });
    const alreadySent = new Set(first.map((t) => briefKey(t.warning.id, t.user.id)));

    const second = selectBriefs({ warnings: [sydneyMetro], users, alreadySent });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(0);
  });

  it("emits nothing for a warning that touches none of the 15 LGAs", () => {
    const warn = warning({ areas: ["Far West", "Riverina"] });
    const users: StormBriefUser[] = [
      { id: "u1", email: "a@x.com", subscribedLgaIds: ["blacktown"] },
    ];
    expect(selectBriefs({ warnings: [warn], users })).toHaveLength(0);
  });

  it("emits one task per warning for a user affected by multiple distinct warnings", () => {
    const warnA = warning({ id: "IDN21031", areas: ["Sydney Metropolitan"] });
    const warnB = warning({ id: "IDN21040", areas: ["near Blacktown"] });
    const users: StormBriefUser[] = [
      { id: "u1", email: "a@x.com", subscribedLgaIds: ["blacktown"] },
    ];

    const tasks = selectBriefs({ warnings: [warnA, warnB], users });

    expect(tasks).toHaveLength(2);
    expect(tasks.map((t) => t.warning.id).sort()).toEqual(["IDN21031", "IDN21040"]);
  });
});
