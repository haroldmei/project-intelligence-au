// Unit tests for the centralised SMS compliance choke point (no DB needed).
// Spam Act 2003: every outbound SMS must carry sender-id + a functional STOP
// footer. These are enforced in src/lib/sms/client.ts so no call site can omit
// them (issue #23).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Force the Twilio REST path on so sendSms actually composes + "sends".
vi.mock("@/lib/env", () => ({
  env: {
    TWILIO_ACCOUNT_SID: "ACtestsid",
    TWILIO_AUTH_TOKEN: "testtoken",
    TWILIO_PHONE_NUMBER: "+61400000000",
  },
}));

import {
  applyComplianceWrapping,
  sendSms,
  SMS_SENDER_ID,
  SMS_STOP_FOOTER,
} from "@/lib/sms/client";

describe("applyComplianceWrapping", () => {
  it("adds sender-id and STOP footer to a bare message", () => {
    const out = applyComplianceWrapping("Storm brief: 3 new roofs in Blacktown.");
    expect(out.startsWith(SMS_SENDER_ID)).toBe(true);
    expect(out).toContain(SMS_STOP_FOOTER);
  });

  it("is idempotent — does not double the sender-id or footer", () => {
    const composed = `${SMS_SENDER_ID} hello\n${SMS_STOP_FOOTER}`;
    expect(applyComplianceWrapping(composed)).toBe(composed);
  });

  it("adds only the footer when the sender-id is already present", () => {
    const out = applyComplianceWrapping(`${SMS_SENDER_ID} hello`);
    expect(out).toBe(`${SMS_SENDER_ID} hello\n${SMS_STOP_FOOTER}`);
  });

  it("adds only the sender-id when a STOP instruction is already present (any casing)", () => {
    const out = applyComplianceWrapping("hello, reply STOP to opt out");
    expect(out).toBe(`${SMS_SENDER_ID} hello, reply STOP to opt out`);
  });
});

describe("sendSms compliance choke point", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sid: "SM_test" }),
    }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("wraps every outbound body with sender-id + STOP footer, even a raw one", async () => {
    const ok = await sendSms({ to: "+61400000001", body: "Raw body, no footer" });
    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const init = fetchMock.mock.calls[0][1] as { body: string };
    const sentBody = new URLSearchParams(init.body).get("Body") ?? "";
    expect(sentBody.startsWith(SMS_SENDER_ID)).toBe(true);
    expect(sentBody).toContain(SMS_STOP_FOOTER);
  });
});
