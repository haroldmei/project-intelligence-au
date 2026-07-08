import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import VerifyPage from "./page";

// Stable router reference (real Next.js useRouter is stable across renders) so
// the [router]-dependency effect runs once — a fresh object each call would
// re-fire the /api/auth/me fetch on every render.
const { push, router } = vi.hoisted(() => {
  const push = vi.fn();
  return { push, router: { push } };
});
vi.mock("next/navigation", () => ({ useRouter: () => router }));

// Default happy-path fetch: /api/auth/me returns an unverified pending email.
function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const body = handler(String(url), init);
      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as Response;
    }),
  );
}

beforeEach(() => {
  push.mockClear();
  mockFetch((url) => {
    if (url.endsWith("/api/auth/me")) {
      return { email: "eil@exmaple.com", emailVerified: false };
    }
    if (url.endsWith("/api/auth/verify-email/change-email")) {
      return { email: "eli@example.com", sent: true };
    }
    return {};
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VerifyPage", () => {
  it("renders heading and step indicator", () => {
    render(<VerifyPage />);
    expect(screen.getByRole("heading", { name: /Check your email/i })).toBeTruthy();
    expect(screen.getByText(/Step 2 of 5/i)).toBeTruthy();
  });

  it("renders 6 OTP digit inputs", () => {
    render(<VerifyPage />);
    for (let i = 1; i <= 6; i++) {
      expect(screen.getByLabelText(new RegExp(`Digit ${i} of 6`, "i"))).toBeTruthy();
    }
  });

  it("renders verify button (disabled by default)", () => {
    render(<VerifyPage />);
    const btn = screen.getByRole("button", { name: /verify email/i });
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the destination email once /api/auth/me resolves (issue #92)", async () => {
    render(<VerifyPage />);
    await waitFor(() => expect(screen.getByText("eil@exmaple.com")).toBeTruthy());
  });

  it("lets a user correct a mistyped email and re-sends the code (issue #92)", async () => {
    render(<VerifyPage />);
    await waitFor(() => expect(screen.getByText("eil@exmaple.com")).toBeTruthy());

    // Open the change-email editor and submit the corrected address.
    fireEvent.click(screen.getByRole("button", { name: /wrong email\? change it/i }));
    const input = screen.getByLabelText(/update your email address/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "eli@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: /update & resend code/i }));

    // The screen now reflects the corrected address and confirms the re-send.
    await waitFor(() => expect(screen.getByText("eli@example.com")).toBeTruthy());
    expect(screen.getByText(/a new code has been sent/i)).toBeTruthy();

    const changeCall = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => String(c[0]).endsWith("/api/auth/verify-email/change-email"),
    );
    expect(changeCall).toBeTruthy();
    expect(JSON.parse(String(changeCall?.[1]?.body))).toEqual({ email: "eli@example.com" });
  });

  it("surfaces a server error when the new email is already taken", async () => {
    render(<VerifyPage />);
    await waitFor(() => expect(screen.getByText("eil@exmaple.com")).toBeTruthy());

    // Re-stub: change-email now rejects with a 409.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).endsWith("/api/auth/me")) {
          return { ok: true, status: 200, json: async () => ({ email: "eil@exmaple.com", emailVerified: false }) } as Response;
        }
        return {
          ok: false,
          status: 409,
          json: async () => ({ error: "An account with this email already exists." }),
        } as Response;
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: /wrong email\? change it/i }));
    fireEvent.change(screen.getByLabelText(/update your email address/i), {
      target: { value: "taken@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /update & resend code/i }));

    await waitFor(() =>
      expect(screen.getByText(/an account with this email already exists/i)).toBeTruthy(),
    );
  });

  describe("resend code behavior", () => {
    it("shows success banner when resend succeeds", async () => {
      render(<VerifyPage _testInitialCountdown={0} />);

      await waitFor(() => expect(screen.getByText("eil@exmaple.com")).toBeTruthy());
      expect(screen.getByRole("button", { name: "Resend code" })).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

      await waitFor(() => {
        expect(screen.getByText(/A new code has been sent/i)).toBeTruthy();
      });
    });

    it("shows error when resend returns 429 (throttled)", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (String(url).endsWith("/api/auth/me")) {
            return { ok: true, status: 200, json: async () => ({ email: "eil@exmaple.com", emailVerified: false }) } as Response;
          }
          return {
            ok: false,
            status: 429,
            json: async () => ({ error: "Please wait before requesting another OTP." }),
          } as Response;
        }),
      );

      render(<VerifyPage _testInitialCountdown={0} />);

      await waitFor(() => expect(screen.getByText("eil@exmaple.com")).toBeTruthy());
      expect(screen.getByRole("button", { name: "Resend code" })).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

      await waitFor(() => {
        const alert = screen.getByRole("alert");
        expect(alert.textContent).toMatch(/Please wait before requesting another OTP/i);
      });
      // Success banner must NOT be shown
      expect(screen.queryByText(/A new code has been sent/i)).toBeNull();

      vi.unstubAllGlobals();
    });

    it("shows network error when fetch rejects", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) => {
          if (String(url).endsWith("/api/auth/me")) {
            return { ok: true, status: 200, json: async () => ({ email: "eil@exmaple.com", emailVerified: false }) } as Response;
          }
          throw new Error("Network failure");
        }),
      );

      render(<VerifyPage _testInitialCountdown={0} />);

      await waitFor(() => expect(screen.getByText("eil@exmaple.com")).toBeTruthy());
      expect(screen.getByRole("button", { name: "Resend code" })).toBeTruthy();

      fireEvent.click(screen.getByRole("button", { name: "Resend code" }));

      await waitFor(() => {
        const alert = screen.getByRole("alert");
        expect(alert.textContent).toMatch(/Network error/i);
      });
      expect(screen.queryByText(/A new code has been sent/i)).toBeNull();

      vi.unstubAllGlobals();
    });
  });
});
