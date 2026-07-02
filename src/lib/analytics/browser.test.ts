// Client-side consent gating for posthog-js (src/lib/analytics/browser.ts).
// posthog-js is mocked; the assertion of record is: ZERO init/capture before
// the user has accepted analytics cookies (issue #17 acceptance criterion).
import { describe, it, expect, vi, beforeEach } from "vitest";

const { initMock, identifyMock, resetMock } = vi.hoisted(() => ({
  initMock: vi.fn(),
  identifyMock: vi.fn(),
  resetMock: vi.fn(),
}));

vi.mock("posthog-js", () => ({
  default: { init: initMock, identify: identifyMock, reset: resetMock },
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules(); // reset the module-level `started` singleton between tests
  vi.unstubAllEnvs();
  window.localStorage.clear();
});

// Fresh import each time so the internal `started` flag starts false.
async function load() {
  return import("@/lib/analytics/browser");
}

describe("initAnalytics — consent gating", () => {
  it("does NOT init without a key, even with consent accepted", async () => {
    window.localStorage.setItem("pi_cookie_consent", "accepted");
    const { initAnalytics } = await load();
    initAnalytics();
    expect(initMock).not.toHaveBeenCalled();
  });

  it("does NOT init before consent (no stored preference)", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const { initAnalytics } = await load();
    initAnalytics();
    expect(initMock).not.toHaveBeenCalled();
  });

  it("does NOT init when consent is rejected", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    window.localStorage.setItem("pi_cookie_consent", "rejected");
    const { initAnalytics } = await load();
    initAnalytics();
    expect(initMock).not.toHaveBeenCalled();
  });

  it("inits exactly once when key present AND consent accepted", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    window.localStorage.setItem("pi_cookie_consent", "accepted");
    const { initAnalytics } = await load();
    initAnalytics();
    initAnalytics(); // idempotent
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(initMock).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({
        api_host: "https://eu.i.posthog.com",
        autocapture: false,
        capture_pageview: true,
        person_profiles: "identified_only",
      }),
    );
  });
});

describe("identifyUser", () => {
  it("is a no-op before init, then identifies by user id after init", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
    const { initAnalytics, identifyUser } = await load();

    identifyUser("user_1"); // no consent yet → not initialised
    expect(identifyMock).not.toHaveBeenCalled();

    window.localStorage.setItem("pi_cookie_consent", "accepted");
    initAnalytics();
    identifyUser("user_1");
    expect(identifyMock).toHaveBeenCalledWith("user_1");
  });
});
