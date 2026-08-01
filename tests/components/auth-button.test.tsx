import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { AuthButton } from "@/components/auth-button";

const { mockUseCurrentProfile } = vi.hoisted(() => ({
  mockUseCurrentProfile: vi.fn(),
}));

vi.mock("@/lib/hooks/use-current-profile", () => ({
  useCurrentProfile: () => mockUseCurrentProfile(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock("@/components/logout-button", () => ({
  LogoutButton: () => <button>signOut</button>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

describe("AuthButton Current Profile presentation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCurrentProfile.mockReturnValue({
      status: "loading",
      isAuthenticated: false,
      currentProfile: undefined,
    });
  });

  it("presents the authenticated Identity Email from Current Profile", () => {
    mockUseCurrentProfile.mockReturnValue({
      status: "available",
      isAuthenticated: true,
      currentProfile: { identity: { email: "profile@example.test" } },
    });

    render(<AuthButton />);

    expect(screen.getByText("profile@example.test")).toBeInTheDocument();
    expect(screen.queryByText("legacy@example.test")).not.toBeInTheDocument();
  });

  it("fails closed while the authenticated Current Profile is unavailable", () => {
    mockUseCurrentProfile.mockReturnValue({
      status: "unavailable",
      isAuthenticated: true,
      currentProfile: undefined,
    });

    render(<AuthButton />);

    expect(screen.queryByRole("link", { name: "signIn" })).not.toBeInTheDocument();
    expect(screen.queryByText("profile@example.test")).not.toBeInTheDocument();
  });
});
