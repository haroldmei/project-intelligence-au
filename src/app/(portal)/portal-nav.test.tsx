import { render, screen, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PortalNav } from "./portal-nav";

// usePathname is the only next/navigation hook the component uses; drive it
// per-test with the mock's return value.
let currentPath = "/digest";
vi.mock("next/navigation", () => ({
  usePathname: () => currentPath,
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...p
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

function setPath(p: string) {
  currentPath = p;
}

describe("PortalNav", () => {
  beforeEach(() => setPath("/digest"));

  for (const variant of ["sidebar", "mobile"] as const) {
    describe(`variant=${variant}`, () => {
      it("marks exactly the current tab with aria-current=page", () => {
        setPath("/history");
        render(<PortalNav variant={variant} />);

        const current = screen.getAllByRole("link", { current: "page" });
        expect(current).toHaveLength(1);
        expect(current[0].getAttribute("href")).toBe("/history");
      });

      it("marks no tab active on an unmatched route", () => {
        setPath("/some/unknown/route");
        render(<PortalNav variant={variant} />);
        expect(screen.queryAllByRole("link", { current: "page" })).toHaveLength(0);
      });

      it("lights up My Area (not Account) on /account/area via longest-prefix match", () => {
        setPath("/account/area");
        const { container } = render(<PortalNav variant={variant} />);

        const current = within(container).getAllByRole("link", { current: "page" });
        expect(current).toHaveLength(1);
        expect(current[0].getAttribute("href")).toBe("/account/area");
      });

      it("lights up Account on a deeper /account sub-route", () => {
        setPath("/account/settings");
        render(<PortalNav variant={variant} />);

        const current = screen.getAllByRole("link", { current: "page" });
        expect(current).toHaveLength(1);
        expect(current[0].getAttribute("href")).toBe("/account");
      });

      it("applies a distinct amber active style to the current tab", () => {
        setPath("/history");
        render(<PortalNav variant={variant} />);

        const active = screen.getByRole("link", { current: "page" });
        const inactive = screen.getByRole("link", { name: /current digest/i });

        // Active tab carries an amber treatment the inactive tab does not.
        expect(active.className).toMatch(/#(D97706|B45309|FDF3E7)/);
        expect(active.className).not.toBe(inactive.className);
      });
    });
  }

  it("renders one nav landmark per variant", () => {
    setPath("/digest");
    const { unmount } = render(<PortalNav variant="sidebar" />);
    expect(screen.getByRole("navigation", { name: /portal navigation/i })).toBeTruthy();
    unmount();
    render(<PortalNav variant="mobile" />);
    expect(screen.getByRole("navigation", { name: /mobile navigation/i })).toBeTruthy();
  });
});
