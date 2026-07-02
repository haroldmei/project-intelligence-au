/**
 * Component test for the landing-page waitlist form (issue #25).
 * Drives the happy path (POST → confirmation), the honeypot presence, and the
 * error path. fetch is mocked; no network.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WaitlistForm } from "./waitlist-form";

function fillForm() {
  fireEvent.change(screen.getByLabelText(/^email$/i), { target: { value: "mel@example.com" } });
  fireEvent.change(screen.getByLabelText(/your trade/i), { target: { value: "plumbing" } });
  fireEvent.change(screen.getByLabelText(/your region/i), { target: { value: "Melbourne" } });
}

describe("WaitlistForm", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a hidden honeypot field", () => {
    render(<WaitlistForm />);
    const honeypot = screen.getByLabelText(/leave blank/i);
    expect(honeypot).toBeTruthy();
    expect(honeypot.getAttribute("tabindex")).toBe("-1");
  });

  it("posts the form and shows a trade/region confirmation on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    render(<WaitlistForm />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /join the waitlist/i }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent(/we'll email you when/i);
    });
    expect(screen.getByRole("status")).toHaveTextContent(/plumbing/);
    expect(screen.getByRole("status")).toHaveTextContent(/Melbourne/);

    // Verify the request payload
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/waitlist",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({
      email: "mel@example.com",
      trade: "plumbing",
      region: "Melbourne",
      source: "landing",
    });
  });

  it("shows a server error message on a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Too many requests. Please try again later." }) })
    );

    render(<WaitlistForm />);
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: /join the waitlist/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/too many requests/i);
    });
  });
});
