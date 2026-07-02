// Unit tests for the server-side PostHog helper (src/lib/analytics/server.ts).
// The posthog-node client is fully mocked; nothing hits the network. Covers:
//   - clean no-op when NEXT_PUBLIC_POSTHOG_KEY is unset,
//   - exact captured event shape keyed by internal user id,
//   - anonymous (cookieless) capture disabling person profiles,
//   - failure isolation (analytics never throws into a request).
import { describe, it, expect, vi, beforeEach } from "vitest";

const { PostHogCtor, captureMock, shutdownMock } = vi.hoisted(() => {
  const captureMock = vi.fn();
  const shutdownMock = vi.fn().mockResolvedValue(undefined);
  // Regular function (not arrow) so it's usable with `new`.
  const PostHogCtor = vi.fn(function () {
    return { capture: captureMock, shutdown: shutdownMock };
  });
  return { PostHogCtor, captureMock, shutdownMock };
});

vi.mock("posthog-node", () => ({ PostHog: PostHogCtor }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

// Load the helper with @/lib/env fully mocked (avoids the server-only env
// schema needing DATABASE_URL etc. in a pure unit test).
async function loadHelper(envOverrides: Record<string, unknown>) {
  vi.doMock("@/lib/env", () => ({
    env: { NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com", ...envOverrides },
  }));
  return import("@/lib/analytics/server");
}

describe("captureServer — no key (dev/test no-op)", () => {
  it("never constructs the client or captures", async () => {
    const { captureServer, captureAnonymous } = await loadHelper({});
    captureServer("user_1", "signup_started", {});
    captureAnonymous("sms:abc", "portal_clickthrough", { source: "sms", slug: "abc" });
    expect(PostHogCtor).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });
});

describe("captureServer — with key", () => {
  it("constructs the client once with host + immediate-flush config", async () => {
    const { captureServer } = await loadHelper({
      NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
      NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com",
    });
    captureServer("u", "signup_started", {});
    captureServer("u", "trial_started", { source: "signup" });
    expect(PostHogCtor).toHaveBeenCalledTimes(1);
    expect(PostHogCtor).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({ host: "https://eu.i.posthog.com", flushAt: 1, flushInterval: 0 }),
    );
  });

  it("captures the exact event shape keyed by internal user id", async () => {
    const { captureServer } = await loadHelper({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test" });
    captureServer("user_42", "digest_sent", { cardCount: 7, fallbackUsed: true });
    expect(captureMock).toHaveBeenCalledWith({
      distinctId: "user_42",
      event: "digest_sent",
      properties: { cardCount: 7, fallbackUsed: true },
    });
  });

  it("da_feedback carries only vote + source (no PII, no DA text)", async () => {
    const { captureServer } = await loadHelper({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test" });
    captureServer("user_9", "da_feedback", { vote: "up", source: "portal" });
    const [arg] = captureMock.mock.calls[0];
    expect(arg.properties).toEqual({ vote: "up", source: "portal" });
    expect(JSON.stringify(arg)).not.toMatch(/@|email|address|applicant/i);
  });

  it("captureAnonymous disables person profiles", async () => {
    const { captureAnonymous } = await loadHelper({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test" });
    captureAnonymous("sms:xyz", "portal_clickthrough", { source: "sms", slug: "xyz" });
    expect(captureMock).toHaveBeenCalledWith({
      distinctId: "sms:xyz",
      event: "portal_clickthrough",
      properties: { source: "sms", slug: "xyz", $process_person_profile: false },
    });
  });

  it("swallows client errors — analytics never breaks a request", async () => {
    captureMock.mockImplementationOnce(() => {
      throw new Error("posthog network down");
    });
    const { captureServer } = await loadHelper({ NEXT_PUBLIC_POSTHOG_KEY: "phc_test" });
    expect(() => captureServer("u", "signup_started", {})).not.toThrow();
  });

  it("shutdownAnalytics flushes the underlying client", async () => {
    const { captureServer, shutdownAnalytics } = await loadHelper({
      NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
    });
    captureServer("u", "signup_started", {});
    await shutdownAnalytics();
    expect(shutdownMock).toHaveBeenCalledTimes(1);
  });
});
