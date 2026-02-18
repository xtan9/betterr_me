import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SidebarUserFooter } from "@/components/layouts/sidebar-user-footer";

// Hoisted mocks
const { mockSWRReturn, mockSetTheme, mockPush, mockSignOut } = vi.hoisted(
  () => ({
    mockSWRReturn: {
      data: {
        profile: {
          full_name: "Jane Doe",
          avatar_url: null,
          email: "jane@example.com",
        },
      },
      error: undefined,
      isLoading: false,
    },
    mockSetTheme: vi.fn(),
    mockPush: vi.fn(),
    mockSignOut: vi.fn().mockResolvedValue({}),
  })
);

// Mock SWR
vi.mock("swr", () => ({
  default: () => mockSWRReturn,
}));

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: { error: vi.fn() },
}));

// Mock shared fetcher
vi.mock("@/lib/fetcher", () => ({
  fetcher: vi.fn(),
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// Mock next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "system", setTheme: mockSetTheme }),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

// Mock supabase client
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut: mockSignOut } }),
}));

// Mock shadcn sidebar components
vi.mock("@/components/ui/sidebar", () => ({
  SidebarMenu: ({ children }: { children: React.ReactNode }) => (
    <ul>{children}</ul>
  ),
  SidebarMenuItem: ({ children }: { children: React.ReactNode }) => (
    <li>{children}</li>
  ),
  SidebarMenuButton: ({
    children,
    ...props
  }: {
    children: React.ReactNode;
    size?: string;
    className?: string;
  }) => <button {...props}>{children}</button>,
}));

// Mock shadcn avatar components
vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) =>
    src ? <img src={src} alt={alt} /> : null,
  AvatarFallback: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <span>{children}</span>,
}));

// Mock shadcn dropdown-menu components
// Store onValueChange for radio groups so items can call it
let radioGroupOnValueChange: ((value: string) => void) | undefined;

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DropdownMenuTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <>{children}</>,
  DropdownMenuContent: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
    side?: string;
    align?: string;
    sideOffset?: number;
  }) => <div>{children}</div>,
  DropdownMenuItem: ({
    children,
    onClick,
    asChild,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    asChild?: boolean;
    className?: string;
  }) => {
    if (asChild) return <>{children}</>;
    return (
      <button onClick={onClick} className={className}>
        {children}
      </button>
    );
  },
  DropdownMenuLabel: ({
    children,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <span>{children}</span>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuRadioGroup: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode;
    value?: string;
    onValueChange?: (value: string) => void;
  }) => {
    radioGroupOnValueChange = onValueChange;
    return <div>{children}</div>;
  },
  DropdownMenuRadioItem: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    value: string;
  }) => (
    <button onClick={() => radioGroupOnValueChange?.(value)}>{children}</button>
  ),
}));

describe("SidebarUserFooter", () => {
  beforeEach(() => {
    mockSWRReturn.data = {
      profile: {
        full_name: "Jane Doe",
        avatar_url: null,
        email: "jane@example.com",
      },
    };
    mockSWRReturn.isLoading = false;
    mockSWRReturn.error = undefined;
    mockSetTheme.mockReset();
    mockPush.mockReset();
    mockSignOut.mockReset().mockResolvedValue({});
    radioGroupOnValueChange = undefined;
  });

  it("renders user name and email when profile loaded", () => {
    render(<SidebarUserFooter />);

    expect(screen.getAllByText("Jane Doe").length).toBeGreaterThan(0);
    expect(screen.getAllByText("jane@example.com").length).toBeGreaterThan(0);
  });

  it("renders avatar fallback initials from full name", () => {
    render(<SidebarUserFooter />);

    expect(screen.getAllByText("JD").length).toBeGreaterThan(0);
  });

  it("renders single initial when name has no last name", () => {
    mockSWRReturn.data = {
      profile: {
        full_name: "Alice",
        avatar_url: null,
        email: "alice@example.com",
      },
    };
    render(<SidebarUserFooter />);

    expect(screen.getAllByText("A").length).toBeGreaterThan(0);
  });

  it("renders email initial when no full name", () => {
    mockSWRReturn.data = {
      profile: {
        full_name: null,
        avatar_url: null,
        email: "bob@example.com",
      },
    };
    render(<SidebarUserFooter />);

    expect(screen.getAllByText("B").length).toBeGreaterThan(0);
  });

  it("renders loading state when profile not loaded", () => {
    mockSWRReturn.data = undefined as unknown as typeof mockSWRReturn.data;
    mockSWRReturn.isLoading = true;

    render(<SidebarUserFooter />);

    expect(screen.getByText("loading")).toBeInTheDocument();
    expect(screen.getAllByText("?").length).toBeGreaterThan(0);
  });

  it("renders settings link in dropdown", () => {
    render(<SidebarUserFooter />);

    const settingsLink = screen.getByRole("link", { name: /settings/i });
    expect(settingsLink).toHaveAttribute("href", "/dashboard/settings");
  });

  it("calls signOut and redirects on logout click", async () => {
    render(<SidebarUserFooter />);

    const logoutButtons = screen
      .getAllByRole("button")
      .filter((btn) => btn.textContent?.includes("logOut"));
    expect(logoutButtons.length).toBeGreaterThan(0);

    fireEvent.click(logoutButtons[0]);

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/auth/login");
    });
  });

  it("renders theme options", () => {
    render(<SidebarUserFooter />);

    expect(screen.getByText("theme")).toBeInTheDocument();
    expect(screen.getByText(/themeLight/)).toBeInTheDocument();
    expect(screen.getByText(/themeDark/)).toBeInTheDocument();
    expect(screen.getByText(/themeSystem/)).toBeInTheDocument();
  });

  it("calls setTheme when theme option is clicked", () => {
    render(<SidebarUserFooter />);

    const darkButton = screen
      .getAllByRole("button")
      .find((btn) => btn.textContent?.includes("themeDark"));
    expect(darkButton).toBeDefined();

    fireEvent.click(darkButton!);
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
  });

  it("renders language options", () => {
    render(<SidebarUserFooter />);

    expect(screen.getByText("language")).toBeInTheDocument();
    expect(screen.getByText(/English/)).toBeInTheDocument();
    expect(
      screen.getByText(/\u7B80\u4F53\u4E2D\u6587/)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/\u7E41\u9AD4\u4E2D\u6587/)
    ).toBeInTheDocument();
  });
});
