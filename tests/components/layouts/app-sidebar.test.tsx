import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
  SidebarGroupLabel: ({ children, asChild }: any) => {
    if (asChild) return <>{children}</>;
    return <span data-testid="sidebar-group-label">{children}</span>;
  },
  SidebarHeader: ({ children }: any) => (
    <div data-testid="sidebar-header">{children}</div>
  ),
  SidebarMenu: ({ children }: any) => <ul>{children}</ul>,
  SidebarMenuItem: ({ children }: any) => <li>{children}</li>,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  SidebarMenuButton: ({ children, isActive, asChild, tooltip, ...props }: any) => {
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
  SidebarMenuBadge: ({ children }: any) => (
    <span data-testid="sidebar-menu-badge">{children}</span>
  ),
  SidebarFooter: ({ children }: any) => (
    <div data-testid="sidebar-footer">{children}</div>
  ),
}));

// Mock shadcn collapsible components
vi.mock("@/components/ui/collapsible", () => ({
  Collapsible: ({ children }: any) => <div>{children}</div>,
  CollapsibleTrigger: ({ children, asChild }: any) => {
    if (asChild) return <>{children}</>;
    return <button>{children}</button>;
  },
  CollapsibleContent: ({ children }: any) => <div>{children}</div>,
}));

// Mock shadcn tooltip components
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: any) => <>{children}</>,
  TooltipTrigger: ({ children, asChild }: any) => {
    if (asChild) return <>{children}</>;
    return <>{children}</>;
  },
  TooltipContent: ({ children }: any) => (
    <span data-testid="tooltip-content">{children}</span>
  ),
  TooltipProvider: ({ children }: any) => <>{children}</>,
}));

const defaultProps = {
  pinned: true,
  onTogglePin: vi.fn(),
};

describe("AppSidebar", () => {
  beforeEach(() => {
    mockPathname.mockReturnValue("/dashboard");
    defaultProps.onTogglePin = vi.fn();
  });

  it("renders all 4 nav items as links", () => {
    render(<AppSidebar {...defaultProps} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(4);
  });

  it("renders correct hrefs for all nav items", () => {
    render(<AppSidebar {...defaultProps} />);

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/dashboard");
    expect(links[1]).toHaveAttribute("href", "/habits");
    expect(links[2]).toHaveAttribute("href", "/tasks");
    expect(links[3]).toHaveAttribute("href", "/dashboard/settings");
  });

  it("renders i18n translation keys as labels", () => {
    render(<AppSidebar {...defaultProps} />);

    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(screen.getByText("habits")).toBeInTheDocument();
    expect(screen.getByText("tasks")).toBeInTheDocument();
    expect(screen.getByText("settings")).toBeInTheDocument();
  });

  it("renders sidebar group labels", () => {
    render(<AppSidebar {...defaultProps} />);

    expect(screen.getByText("mainGroup")).toBeInTheDocument();
    expect(screen.getByText("accountGroup")).toBeInTheDocument();
  });

  it("highlights dashboard link when pathname is /dashboard", () => {
    mockPathname.mockReturnValue("/dashboard");
    render(<AppSidebar {...defaultProps} />);

    const activeLink = screen.getByRole("link", { current: "page" });
    expect(activeLink).toHaveAttribute("href", "/dashboard");
  });

  it("highlights settings link when pathname is /dashboard/settings", () => {
    mockPathname.mockReturnValue("/dashboard/settings");
    render(<AppSidebar {...defaultProps} />);

    const activeLink = screen.getByRole("link", { current: "page" });
    expect(activeLink).toHaveAttribute("href", "/dashboard/settings");
  });

  it("does not highlight dashboard when on /dashboard/settings", () => {
    mockPathname.mockReturnValue("/dashboard/settings");
    render(<AppSidebar {...defaultProps} />);

    const dashboardLink = screen.getByRole("link", { name: /dashboard/i });
    expect(dashboardLink).not.toHaveAttribute("aria-current", "page");
  });

  it("highlights habits link for nested habits routes", () => {
    mockPathname.mockReturnValue("/habits/abc-123");
    render(<AppSidebar {...defaultProps} />);

    const activeLink = screen.getByRole("link", { current: "page" });
    expect(activeLink).toHaveAttribute("href", "/habits");
  });

  it("highlights tasks link when on tasks page", () => {
    mockPathname.mockReturnValue("/tasks");
    render(<AppSidebar {...defaultProps} />);

    const activeLink = screen.getByRole("link", { current: "page" });
    expect(activeLink).toHaveAttribute("href", "/tasks");
  });

  it("has only one active nav item at a time", () => {
    mockPathname.mockReturnValue("/dashboard");
    render(<AppSidebar {...defaultProps} />);

    const links = screen.getAllByRole("link");
    const activeLinks = links.filter(
      (link) => link.getAttribute("aria-current") === "page"
    );
    expect(activeLinks).toHaveLength(1);
  });

  it("renders brand text in sidebar header", () => {
    render(<AppSidebar {...defaultProps} />);

    expect(screen.getByText("BetterR.me")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar-header")).toContainElement(
      screen.getByText("BetterR.me")
    );
  });

  it("renders as a nav element for accessibility", () => {
    render(<AppSidebar {...defaultProps} />);

    expect(screen.getByTestId("sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("sidebar").tagName).toBe("NAV");
  });

  describe("pin toggle button", () => {
    it("renders pin toggle button in sidebar header", () => {
      render(<AppSidebar {...defaultProps} />);

      const pinButton = screen.getByRole("button", { pressed: true });
      expect(pinButton).toBeInTheDocument();
      expect(screen.getByTestId("sidebar-header")).toContainElement(pinButton);
    });

    it("shows aria-pressed=true when pinned", () => {
      render(<AppSidebar {...defaultProps} pinned={true} />);

      const pinButton = screen.getByRole("button", { pressed: true });
      expect(pinButton).toHaveAttribute("aria-pressed", "true");
    });

    it("shows aria-pressed=false when unpinned", () => {
      render(<AppSidebar {...defaultProps} pinned={false} />);

      const pinButton = screen.getByRole("button", { pressed: false });
      expect(pinButton).toHaveAttribute("aria-pressed", "false");
    });

    it("calls onTogglePin when pin button is clicked", () => {
      const onTogglePin = vi.fn();
      render(<AppSidebar pinned={true} onTogglePin={onTogglePin} />);

      const pinButton = screen.getByRole("button", { pressed: true });
      fireEvent.click(pinButton);

      expect(onTogglePin).toHaveBeenCalledTimes(1);
    });

    it("shows unpin label when pinned", () => {
      render(<AppSidebar {...defaultProps} pinned={true} />);

      const pinButton = screen.getByRole("button", { pressed: true });
      expect(pinButton).toHaveAttribute("aria-label", "unpinLabel");

      const tooltipContent = screen.getByTestId("tooltip-content");
      expect(tooltipContent).toHaveTextContent("unpin");
    });

    it("shows pin label when unpinned", () => {
      render(<AppSidebar {...defaultProps} pinned={false} />);

      const pinButton = screen.getByRole("button", { pressed: false });
      expect(pinButton).toHaveAttribute("aria-label", "pinLabel");

      const tooltipContent = screen.getByTestId("tooltip-content");
      expect(tooltipContent).toHaveTextContent("pin");
    });
  });
});
