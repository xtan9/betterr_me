import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { HouseholdSettings } from "@/components/money/household-settings";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock sub-components to isolate HouseholdSettings tests
vi.mock("@/components/money/household-members-list", () => ({
  HouseholdMembersList: ({
    members,
    isOwner,
  }: {
    members: Array<{ id: string }>;
    isOwner: boolean;
  }) => (
    <div data-testid="household-members-list">
      {members.length} members, isOwner={String(isOwner)}
    </div>
  ),
}));

vi.mock("@/components/money/household-invite-dialog", () => ({
  HouseholdInviteDialog: () => (
    <button data-testid="household-invite-dialog">invitePartner</button>
  ),
}));

// Mock useHousehold hook
const { mockUseHousehold } = vi.hoisted(() => ({
  mockUseHousehold: vi.fn(),
}));

vi.mock("@/lib/hooks/use-household", () => ({
  useHousehold: mockUseHousehold,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMember(overrides: Partial<{
  id: string;
  user_id: string;
  role: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
}>) {
  return {
    id: "member-1",
    user_id: "user-1",
    household_id: "hh-1",
    role: "member",
    email: "test@example.com",
    full_name: "Test User",
    avatar_url: null,
    joined_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HouseholdSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows invite button for owner", () => {
    mockUseHousehold.mockReturnValue({
      members: [
        makeMember({ id: "m1", user_id: "user-1", role: "owner" }),
        makeMember({ id: "m2", user_id: "user-2", role: "member" }),
      ],
      invitations: [],
      isOwner: true,
      isLoading: false,
      mutate: vi.fn(),
      userId: "user-1",
    });

    render(<HouseholdSettings />);

    expect(screen.getByTestId("household-invite-dialog")).toBeInTheDocument();
  });

  it("hides invite button for non-owner", () => {
    mockUseHousehold.mockReturnValue({
      members: [
        makeMember({ id: "m1", user_id: "user-1", role: "owner" }),
        makeMember({ id: "m2", user_id: "user-2", role: "member" }),
      ],
      invitations: [],
      isOwner: false,
      isLoading: false,
      mutate: vi.fn(),
      userId: "user-2",
    });

    render(<HouseholdSettings />);

    expect(
      screen.queryByTestId("household-invite-dialog")
    ).not.toBeInTheDocument();
  });

  it("shows member list", () => {
    mockUseHousehold.mockReturnValue({
      members: [
        makeMember({ id: "m1", user_id: "user-1", role: "owner" }),
        makeMember({ id: "m2", user_id: "user-2", role: "member" }),
      ],
      invitations: [],
      isOwner: true,
      isLoading: false,
      mutate: vi.fn(),
      userId: "user-1",
    });

    render(<HouseholdSettings />);

    const memberList = screen.getByTestId("household-members-list");
    expect(memberList).toBeInTheDocument();
    expect(memberList).toHaveTextContent("2 members");
  });

  it("shows loading skeleton when loading", () => {
    mockUseHousehold.mockReturnValue({
      members: [],
      invitations: [],
      isOwner: false,
      isLoading: true,
      mutate: vi.fn(),
      userId: null,
    });

    const { container } = render(<HouseholdSettings />);

    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("displays member count in header", () => {
    mockUseHousehold.mockReturnValue({
      members: [
        makeMember({ id: "m1", user_id: "user-1", role: "owner" }),
        makeMember({ id: "m2", user_id: "user-2", role: "member" }),
        makeMember({ id: "m3", user_id: "user-3", role: "member" }),
      ],
      invitations: [],
      isOwner: true,
      isLoading: false,
      mutate: vi.fn(),
      userId: "user-1",
    });

    render(<HouseholdSettings />);

    // The count is shown as "(3)"
    expect(screen.getByText("(3)")).toBeInTheDocument();
  });
});
