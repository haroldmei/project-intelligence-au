import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import LoginPage from "./page";

// Capture router.push across renders (issue #137 — login must send the user to
// the sanitized ?returnTo, not always /digest).
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock }) }));
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
