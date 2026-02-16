import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppSidebar } from "@/components/layouts/app-sidebar";

// Mock next/navigation
const mockPathname = vi.fn(() => "/dashboard");
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname(),
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock shadcn sidebar components with simplified versions
vi.mock("@/components/ui/sidebar", () => ({
  Sidebar: ({ children, ...props }: any) => (
    <nav data-testid="sidebar" {...props}>
      {children}
    </nav>
  ),
  SidebarContent: ({ children }: any) => <div>{children}</div>,
  SidebarGroup: ({ children }: any) => <div>{children}</div>,
  SidebarGroupContent: ({ children }: any) => <div>{children}</div>,
  SidebarHeader: ({ children }: any) => (
    <div data-testid="sidebar-header">{children}</div>
  ),
  SidebarMenu: ({ children }: any) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: any) => <li>{children}</li>,
  SidebarMenuButton: ({
    children,
    isActive,
    asChild,
    tooltip,
    ...props
  }: any) => {
    if (asChild) {
      const child = React.Children.only(children);
      return React.cloneElement(child, {
        "data-active": isActive || undefined,
        "aria-current": isActive ? "page" : undefined,
      });
    }
    return (
      <button data-active={isActive || undefined} {...props}>
        {children}
      </button>
    );
  },
  SidebarFooter: ({ children }: any) => (
    <div data-testid="sidebar-footer">{children}</div>
  ),
}));

describe("AppSidebar", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/dashboard");
  });

  it("renders all 3 nav items as links", () => {
    render(<AppSidebar />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
  });

  it("renders correct hrefs for all nav items", () => {
    render(<AppSidebar />);

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/dashboard");
    expect(links[1]).toHaveAttribute("href", "/habits");
    expect(links[2]).toHaveAttribute("href", "/tasks");
  });

  it("renders i18n translation keys as labels", () => {
    render(<AppSidebar />);

    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(screen.getByText("habits")).toBeInTheDocument();
    expect(screen.getByText("tasks")).toBeInTheDocument();
  });

  it("highlights dashboard link when pathname is /dashboard", () => {
    mockPathname.mockReturnValue("/dashboard");
    render(<AppSidebar />);

    const activeLink = screen.getByRole("link", { current: "page" });
    expect(activeLink).toHaveAttribute("href", "/dashboard");
  });

  it("highlights dashboard link when pathname is /dashboard/settings", () => {
    mockPathname.mockReturnValue("/dashboard/settings");
    render(<AppSidebar />);

    const activeLink = screen.getByRole("link", { current: "page" });
    expect(activeLink).toHaveAttribute("href", "/dashboard");
  });

  it("highlights habits link for nested habits routes", () => {
    mockPathname.mockReturnValue("/habits/abc-123");
    render(<AppSidebar />);

    const activeLink = screen.getByRole("link", { current: "page" });
    expect(activeLink).toHaveAttribute("href", "/habits");
  });

  it("highlights tasks link when on tasks page", () => {
    mockPathname.mockReturnValue("/tasks");
    render(<AppSidebar />);

    const activeLink = screen.getByRole("link", { current: "page" });
    expect(activeLink).toHaveAttribute("href", "/tasks");
  });

  it("has only one active nav item at a time", () => {
    mockPathname.mockReturnValue("/dashboard");
    render(<AppSidebar />);

    const links = screen.getAllByRole("link");
    const activeLinks = links.filter(
      (link) => link.getAttribute("aria-current") === "page"
    );
    expect(activeLinks).toHaveLength(1);
  });

  it("renders brand text in sidebar header", () => {
    render(<AppSidebar />);

    expect(screen.getByText("BetterR.me")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-header")).toContainElement(
      screen.getByText("BetterR.me")
    );
  });

  it("renders as a nav element for accessibility", () => {
    render(<AppSidebar />);

    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar").tagName).toBe("NAV");
  });
});
