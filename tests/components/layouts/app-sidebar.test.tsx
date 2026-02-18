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

// Mock SidebarUserFooter (tested separately)
vi.mock("@/components/layouts/sidebar-user-footer", () => ({
  SidebarUserFooter: () => <div data-testid="sidebar-user-footer">User Footer</div>,
}));

// Mock useSidebarCounts
const mockUseSidebarCounts = vi.fn(() => ({
  habitsIncomplete: 0,
  tasksDue: 0,
  isLoading: false,
  error: null,
  mutate: vi.fn(),
}));
vi.mock("@/lib/hooks/use-sidebar-counts", () => ({
  useSidebarCounts: () => mockUseSidebarCounts(),
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
    mockUseSidebarCounts.mockReturnValue({
      habitsIncomplete: 0,
      tasksDue: 0,
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    });
  });

  it("renders all 3 nav items as links (flat list, no settings)", () => {
    render(<AppSidebar {...defaultProps} />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
  });

  it("renders correct hrefs for all nav items", () => {
    render(<AppSidebar {...defaultProps} />);

    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/dashboard");
    expect(links[1]).toHaveAttribute("href", "/habits");
    expect(links[2]).toHaveAttribute("href", "/tasks");
  });

  it("renders i18n translation keys as labels", () => {
    render(<AppSidebar {...defaultProps} />);

    expect(screen.getByText("dashboard")).toBeInTheDocument();
    expect(screen.getByText("habits")).toBeInTheDocument();
    expect(screen.getByText("tasks")).toBeInTheDocument();
  });

  it("renders flat nav without group labels", () => {
    render(<AppSidebar {...defaultProps} />);

    expect(screen.queryByText("mainGroup")).not.toBeInTheDocument();
    expect(screen.queryByText("accountGroup")).not.toBeInTheDocument();
  });

  it("renders icon containers for each nav item", () => {
    render(<AppSidebar {...defaultProps} />);

    const links = screen.getAllByRole("link");
    links.forEach((link) => {
      const iconContainer = link.querySelector(".size-6");
      expect(iconContainer).toBeInTheDocument();
    });
  });

  it("highlights dashboard link when pathname is /dashboard", () => {
    mockPathname.mockReturnValue("/dashboard");
    render(<AppSidebar {...defaultProps} />);

    const activeLink = screen.getByRole("link", { current: "page" });
    expect(activeLink).toHaveAttribute("href", "/dashboard");
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

  describe("notification badges", () => {
    it("shows habits badge when habitsIncomplete > 0", () => {
      mockUseSidebarCounts.mockReturnValue({
        habitsIncomplete: 3,
        tasksDue: 0,
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      });
      render(<AppSidebar {...defaultProps} />);

      const badges = screen.getAllByTestId("sidebar-menu-badge");
      expect(badges).toHaveLength(1);
      expect(badges[0]).toHaveTextContent("3");
    });

    it("shows tasks badge when tasksDue > 0", () => {
      mockUseSidebarCounts.mockReturnValue({
        habitsIncomplete: 0,
        tasksDue: 5,
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      });
      render(<AppSidebar {...defaultProps} />);

      const badges = screen.getAllByTestId("sidebar-menu-badge");
      expect(badges).toHaveLength(1);
      expect(badges[0]).toHaveTextContent("5");
    });

    it("hides badges when counts are 0", () => {
      mockUseSidebarCounts.mockReturnValue({
        habitsIncomplete: 0,
        tasksDue: 0,
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      });
      render(<AppSidebar {...defaultProps} />);

      const badges = screen.queryAllByTestId("sidebar-menu-badge");
      expect(badges).toHaveLength(0);
    });

    it("caps badge display at 9+", () => {
      mockUseSidebarCounts.mockReturnValue({
        habitsIncomplete: 15,
        tasksDue: 0,
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      });
      render(<AppSidebar {...defaultProps} />);

      const badges = screen.getAllByTestId("sidebar-menu-badge");
      expect(badges).toHaveLength(1);
      expect(badges[0]).toHaveTextContent("9+");
    });

    it("does not show badge for dashboard", () => {
      mockUseSidebarCounts.mockReturnValue({
        habitsIncomplete: 3,
        tasksDue: 5,
        isLoading: false,
        error: null,
        mutate: vi.fn(),
      });
      render(<AppSidebar {...defaultProps} />);

      const badges = screen.getAllByTestId("sidebar-menu-badge");
      expect(badges).toHaveLength(2);
    });
  });
});
