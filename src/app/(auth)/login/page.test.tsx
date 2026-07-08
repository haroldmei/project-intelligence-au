import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import LoginPage from "./page";

// Capture router.push across renders (issue #137 — login must send the user to
// the sanitized ?returnTo, not always /digest).
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  // Mirror the real hook: reflect whatever URL the test has pushed.
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...p}>{children}</a>
  ),
}));

function submitValidCredentials() {
  fireEvent.change(screen.getByLabelText(/email address/i), {
    target: { value: "subbie@example.com" },
  });
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: "correct-horse" },
  });
  fireEvent.click(screen.getByRole("button", { name: /^log in$/i }));
}

describe("LoginPage — returnTo (issue #137)", () => {
  beforeEach(() => {
    pushMock.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ session_set: true }) }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/login");
  });

  it("returns to the digest+confirmation URL preserved in ?returnTo after login", async () => {
    window.history.pushState(
      {},
      "",
      "/login?returnTo=" + encodeURIComponent("/digest?feedback=recorded&daId=da-1&vote=up"),
    );
    render(<LoginPage />);
    submitValidCredentials();

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/digest?feedback=recorded&daId=da-1&vote=up"),
    );
  });

  it("defaults to /digest when there is no returnTo", async () => {
    window.history.pushState({}, "", "/login");
    render(<LoginPage />);
    submitValidCredentials();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/digest"));
  });

  it("refuses an external returnTo (open-redirect guard)", async () => {
    window.history.pushState({}, "", "/login?returnTo=" + encodeURIComponent("//evil.com"));
    render(<LoginPage />);
    submitValidCredentials();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/digest"));
    expect(pushMock).not.toHaveBeenCalledWith("//evil.com");
  });
});

// Issue #180: an unverified account has no digest to return to (the Sunday cron
// skips it), so login must send it to /verify — not the ?returnTo/digest path —
// avoiding a portal flash before the layout's own gate bounces it.
describe("LoginPage — unverified routing (issue #180)", () => {
  function stubLoginResponse(body: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => body }),
    );
  }
  beforeEach(() => {
    pushMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState({}, "", "/login");
  });

  it("routes an unverified user to /verify, ignoring returnTo", async () => {
    window.history.pushState(
      {},
      "",
      "/login?returnTo=" + encodeURIComponent("/digest?feedback=recorded"),
    );
    stubLoginResponse({ session_set: true, emailVerified: false });
    render(<LoginPage />);
    submitValidCredentials();

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/verify"));
    expect(pushMock).not.toHaveBeenCalledWith("/digest?feedback=recorded");
  });

  it("routes a verified user to the returnTo destination", async () => {
    window.history.pushState(
      {},
      "",
      "/login?returnTo=" + encodeURIComponent("/digest?feedback=recorded"),
    );
    stubLoginResponse({ session_set: true, emailVerified: true });
    render(<LoginPage />);
    submitValidCredentials();

    await waitFor(() =>
      expect(pushMock).toHaveBeenCalledWith("/digest?feedback=recorded"),
    );
    expect(pushMock).not.toHaveBeenCalledWith("/verify");
  });
});

// The reset flow redirects to /login?reset=success but the param used to be
// inert — the tradie landed on a bare form with no acknowledgement (issue #184).
describe("LoginPage — password-reset confirmation (issue #184)", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/login");
  });

  it("shows a role=status confirmation when ?reset=success is present", () => {
    window.history.pushState({}, "", "/login?reset=success");
    render(<LoginPage />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent(/password was updated/i);
    // Distinct from the error alert region.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("does not show the confirmation on a cold visit", () => {
    window.history.pushState({}, "", "/login");
    render(<LoginPage />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/password was updated/i)).not.toBeInTheDocument();
  });

  it("does not show the confirmation for an unrelated ?reset value", () => {
    window.history.pushState({}, "", "/login?reset=1");
    render(<LoginPage />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
