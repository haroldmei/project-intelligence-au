// Unit tests for the Resend email client (issue #179): the `headers`
// pass-through to resend.emails.send.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Set RESEND_API_KEY *before* @/lib/env is imported (hoisted above the imports)
// so `email/client.ts` constructs a real (mocked) Resend instead of no-op'ing.
const { sendMock } = vi.hoisted(() => {
  process.env.RESEND_API_KEY = "re_test_key_0123456789";
  return { sendMock: vi.fn() };
});

vi.mock("resend", () => ({
  // A regular function (not an arrow) so `new Resend(key)` can construct it.
  Resend: vi.fn(function () {
    return { emails: { send: sendMock } };
  }),
}));

import { sendEmail } from "@/lib/email/client";
import { buildListUnsubscribeHeaders } from "@/lib/email/list-unsubscribe";

const DIGEST_PROPS = {
  weekStart: "1 Jun 2026",
  leadCount: 0,
  lgas: ["Inner West"],
  cards: [],
  smsEnabled: false,
};

beforeEach(() => {
  sendMock.mockReset().mockResolvedValue({ data: { id: "email-1" }, error: null });
});

describe("sendEmail — headers pass-through", () => {
  it("forwards the List-Unsubscribe headers to resend.emails.send", async () => {
    const headers = buildListUnsubscribeHeaders("https://app.example.com/api/unsubscribe/tok");
    await sendEmail({ to: "a@b.com", template: "weekly-digest", props: DIGEST_PROPS, headers });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].headers).toEqual(headers);
  });

  it("omits the headers key entirely when a caller passes none (transactional sends)", async () => {
    await sendEmail({ to: "a@b.com", template: "weekly-digest", props: DIGEST_PROPS });

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0]).not.toHaveProperty("headers");
  });
});
