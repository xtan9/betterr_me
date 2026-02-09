import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

// Mock next/navigation
const mockPathname = vi.fn(() => "/dashboard");
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("MobileBottomNav", () => {
  it("renders all 3 nav items", () => {
    render(<MobileBottomNav />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
  });

  it("renders correct hrefs", () => {
    render(<MobileBottomNav />);

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/dashboard");
    expect(links[1]).toHaveAttribute("href", "/habits");
    expect(links[2]).toHaveAttribute("href", "/dashboard/settings");
  });

  it("renders labels via i18n keys", () => {
    render(<MobileBottomNav />);

    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(screen.getByText("habits")).toBeInTheDocument();
    expect(screen.getByText("settings")).toBeInTheDocument();
  });

  it("highlights active tab when pathname matches /dashboard", () => {
    mockPathname.mockReturnValue("/dashboard");
    render(<MobileBottomNav />);

    const dashboardLink = screen.getByRole("link", { current: "page" });
    expect(dashboardLink).toHaveAttribute("href", "/dashboard");
  });

  it("highlights habits tab for nested routes", () => {
    mockPathname.mockReturnValue("/habits/abc-123");
    render(<MobileBottomNav />);

    const activeLink = screen.getByRole("link", { current: "page" });
    expect(activeLink).toHaveAttribute("href", "/habits");
  });

  it("highlights settings tab when on settings page", () => {
    mockPathname.mockReturnValue("/dashboard/settings");
    render(<MobileBottomNav />);

    const activeLink = screen.getByRole("link", { current: "page" });
    expect(activeLink).toHaveAttribute("href", "/dashboard/settings");
  });

  it("has aria-current=page only on active tab", () => {
    mockPathname.mockReturnValue("/dashboard");
    render(<MobileBottomNav />);

    const links = screen.getAllByRole("link");
    const linksWithAriaCurrent = links.filter(
      (link) => link.getAttribute("aria-current") === "page"
    );
    expect(linksWithAriaCurrent).toHaveLength(1);
  });

  it("has md:hidden class for desktop hiding", () => {
    render(<MobileBottomNav />);

    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(nav.className).toContain("md:hidden");
  });

  it("has correct aria-label", () => {
    render(<MobileBottomNav />);

    expect(
      screen.getByRole("navigation", { name: "Main navigation" })
    ).toBeInTheDocument();
  });
});
