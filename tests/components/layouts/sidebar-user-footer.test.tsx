import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SidebarUserFooter } from "@/components/layouts/sidebar-user-footer";

// Hoisted mocks
const { mockSWRReturn, mockMutateProfile, mockSetTheme, mockPush, mockSignOut } = vi.hoisted(
  () => ({
    mockSWRReturn: {
      data: {
        currentProfile: {
          identity: { email: "jane@example.com" },
          profileDetails: {
            fullName: "Jane Doe" as string | null,
            avatarUrl: null as string | null,
          },
          preferences: {
            appearance: { theme: { status: "ready", value: "system" } },
          },
        },
      },
      error: undefined,
      isLoading: false,
    },
    mockMutateProfile: vi.fn(),
    mockSetTheme: vi.fn(),
    mockPush: vi.fn(),
    mockSignOut: vi.fn().mockResolvedValue({}),
  })
);

// Mock SWR
vi.mock("swr", () => ({
  default: () => ({ ...mockSWRReturn, mutate: mockMutateProfile }),
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
  createClient: () => ({
    auth: {
      signOut: mockSignOut,
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: "user-1" } } },
      }),
      onAuthStateChange: vi.fn((callback: (event: string, session: unknown) => void) => {
        callback("SIGNED_IN", { user: { id: "user-1" } });
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      }),
    },
  }),
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
      currentProfile: {
        identity: { email: "jane@example.com" },
        profileDetails: { fullName: "Jane Doe", avatarUrl: null },
        preferences: {
          appearance: { theme: { status: "ready", value: "system" } },
        },
      },
    };
    mockSWRReturn.isLoading = false;
    mockSWRReturn.error = undefined;
    mockSetTheme.mockReset();
    mockMutateProfile.mockReset().mockResolvedValue(undefined);
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
      currentProfile: {
        identity: { email: "alice@example.com" },
        profileDetails: { fullName: "Alice", avatarUrl: null },
        preferences: {
          appearance: { theme: { status: "ready", value: "system" } },
        },
      },
    };
    render(<SidebarUserFooter />);

    expect(screen.getAllByText("A").length).toBeGreaterThan(0);
  });

  it("renders email initial when no full name", () => {
    mockSWRReturn.data = {
      currentProfile: {
        identity: { email: "bob@example.com" },
        profileDetails: { fullName: null, avatarUrl: null },
        preferences: {
          appearance: { theme: { status: "ready", value: "system" } },
        },
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

  it("persists a theme preference when a theme option is clicked", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        profile: { preferences: { theme: "dark" } },
      }),
    }));
    render(<SidebarUserFooter />);

    const darkButton = screen
      .getAllByRole("button")
      .find((btn) => btn.textContent?.includes("themeDark"));
    expect(darkButton).toBeDefined();

    fireEvent.click(darkButton!);
    expect(mockSetTheme).toHaveBeenCalledWith("dark");
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/preferences/appearance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ type: "setTheme", theme: "dark" }),
      });
    });
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
