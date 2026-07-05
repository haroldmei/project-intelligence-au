// Unit test for the RFC-8058 header builder (issue #179).
import { describe, it, expect } from "vitest";
import { buildListUnsubscribeHeaders } from "@/lib/email/list-unsubscribe";

describe("buildListUnsubscribeHeaders", () => {
  it("emits the List-Unsubscribe + one-click POST pair", () => {
    const h = buildListUnsubscribeHeaders("https://app.example.com/api/unsubscribe/tok");
    expect(h).toEqual({
      "List-Unsubscribe": "<https://app.example.com/api/unsubscribe/tok>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });

  it("angle-bracket-wraps the URL exactly (RFC-8058 requires the <...> form)", () => {
    const h = buildListUnsubscribeHeaders("https://x/y");
    expect(h["List-Unsubscribe"]).toBe("<https://x/y>");
  });
});
