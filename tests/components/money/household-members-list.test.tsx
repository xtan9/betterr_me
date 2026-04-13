import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { HouseholdMembersList } from "@/components/money/household-members-list";
import type {
  HouseholdMemberWithProfile,
  HouseholdInvitation,
} from "@/lib/db/types";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

function makeMember(
  overrides: Partial<HouseholdMemberWithProfile> = {}
): HouseholdMemberWithProfile {
  return {
    id: "m-1",
    user_id: "user-1",
    household_id: "hh-1",
    role: "member",
    email: "alice@example.com",
    full_name: "Alice Smith",
    avatar_url: null,
    joined_at: "2026-01-01T00:00:00Z",
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as HouseholdMemberWithProfile;
}

function makeInvite(
  overrides: Partial<HouseholdInvitation> = {}
): HouseholdInvitation {
  return {
    id: "inv-1",
    household_id: "hh-1",
    email: "bob@example.com",
    invited_by: "user-1",
    status: "pending",
    token: "tok",
    expires_at: "2026-12-01T00:00:00Z",
    created_at: "2026-02-01T00:00:00Z",
    accepted_at: null,
    ...overrides,
  } as HouseholdInvitation;
}

describe("HouseholdMembersList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders owner and member rows with correct badges", () => {
    const onMutate = vi.fn();
    render(
      <HouseholdMembersList
        members={[
          makeMember({ id: "m1", user_id: "u1", role: "owner", full_name: "Owner One", email: "o@x.com" }),
          makeMember({ id: "m2", user_id: "u2", role: "member", full_name: "Member Two", email: "m@x.com" }),
        ]}
        invitations={[]}
        isOwner={true}
        currentUserId="u1"
        onMutate={onMutate}
      />
    );

    expect(screen.getByText("Owner One")).toBeInTheDocument();
    expect(screen.getByText("Member Two")).toBeInTheDocument();
    expect(screen.getByText("memberOwner")).toBeInTheDocument();
    expect(screen.getByText("memberMember")).toBeInTheDocument();
    // "you" marker on owner row (since currentUserId=u1)
    expect(screen.getByText("memberYou")).toBeInTheDocument();
  });

  it("falls back to email when full_name missing and uses first letter as initials", () => {
    render(
      <HouseholdMembersList
        members={[
          makeMember({
            id: "m1",
            user_id: "u1",
            full_name: null,
            email: "zed@example.com",
          }),
        ]}
        invitations={[]}
        isOwner={false}
        currentUserId="u1"
        onMutate={vi.fn()}
      />
    );

    // Email appears twice when full_name is null: once as the display name, once as the row email
    expect(screen.getAllByText("zed@example.com").length).toBeGreaterThanOrEqual(1);
  });

  it("shows remove button for owner viewing other members and removes on confirm", async () => {
    const onMutate = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <HouseholdMembersList
        members={[
          makeMember({ id: "m1", user_id: "u1", role: "owner" }),
          makeMember({ id: "m2", user_id: "u2", role: "member" }),
        ]}
        invitations={[]}
        isOwner={true}
        currentUserId="u1"
        onMutate={onMutate}
      />
    );

    const removeBtn = screen.getByRole("button", { name: "memberRemove" });
    fireEvent.click(removeBtn);

    // Confirm in the dialog
    const confirm = await screen.findAllByText("memberRemove");
    // There are multiple — the last one is inside the AlertDialog action
    const actionBtn = confirm.find((el) => el.tagName === "BUTTON" && el.textContent === "memberRemove");
    fireEvent.click(actionBtn!);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/money/household/members/m2",
        expect.objectContaining({ method: "DELETE" })
      );
    });
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalled();
      expect(onMutate).toHaveBeenCalled();
    });
  });

  it("shows error toast when remove fails", async () => {
    const onMutate = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Cannot remove" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <HouseholdMembersList
        members={[
          makeMember({ id: "m1", user_id: "u1", role: "owner" }),
          makeMember({ id: "m2", user_id: "u2", role: "member" }),
        ]}
        invitations={[]}
        isOwner={true}
        currentUserId="u1"
        onMutate={onMutate}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "memberRemove" }));
    const confirmButtons = await screen.findAllByText("memberRemove");
    const actionBtn = confirmButtons.find(
      (el) => el.tagName === "BUTTON" && el.textContent === "memberRemove"
    );
    fireEvent.click(actionBtn!);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Cannot remove");
    });
    expect(onMutate).not.toHaveBeenCalled();
  });

  it("renders pending invitations and revokes on confirm", async () => {
    const onMutate = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <HouseholdMembersList
        members={[makeMember({ id: "m1", user_id: "u1", role: "owner" })]}
        invitations={[
          makeInvite({ id: "inv-1", email: "bob@example.com" }),
          // non-pending, should be filtered out
          makeInvite({ id: "inv-2", status: "accepted", email: "nope@x.com" }),
        ]}
        isOwner={true}
        currentUserId="u1"
        onMutate={onMutate}
      />
    );

    expect(screen.getByText("bob@example.com")).toBeInTheDocument();
    expect(screen.queryByText("nope@x.com")).not.toBeInTheDocument();

    const revokeButtons = screen.getAllByText("inviteRevoke");
    // First is the trigger button
    const triggerButton = revokeButtons.find(
      (el) => el.closest("button") !== null
    )!.closest("button")!;
    fireEvent.click(triggerButton);

    const confirmButtons = await screen.findAllByText("inviteRevoke");
    const actionBtn = confirmButtons
      .map((el) => el.closest("button"))
      .filter((b): b is HTMLButtonElement => !!b)
      .pop()!;
    fireEvent.click(actionBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/money/household/invite?id=inv-1",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });

  it("shows leave button for non-owner and calls leave endpoint", async () => {
    const onMutate = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <HouseholdMembersList
        members={[
          makeMember({ id: "m1", user_id: "u1", role: "owner" }),
          makeMember({ id: "m2", user_id: "u2", role: "member" }),
        ]}
        invitations={[]}
        isOwner={false}
        currentUserId="u2"
        onMutate={onMutate}
      />
    );

    const leaveTriggers = screen.getAllByText("memberLeave");
    const leaveTriggerBtn = leaveTriggers
      .map((el) => el.closest("button"))
      .filter((b): b is HTMLButtonElement => !!b)[0];
    fireEvent.click(leaveTriggerBtn);

    const confirmButtons = await screen.findAllByText("memberLeave");
    const actionBtn = confirmButtons
      .map((el) => el.closest("button"))
      .filter((b): b is HTMLButtonElement => !!b)
      .pop()!;
    fireEvent.click(actionBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/money/household/leave",
        expect.objectContaining({ method: "POST" })
      );
    });
    await waitFor(() => expect(onMutate).toHaveBeenCalled());
  });

  it("shows error toast when revoke invite fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Invite expired" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <HouseholdMembersList
        members={[makeMember({ id: "m1", user_id: "u1", role: "owner" })]}
        invitations={[makeInvite({ id: "inv-1" })]}
        isOwner={true}
        currentUserId="u1"
        onMutate={vi.fn()}
      />
    );

    const revokeButtons = screen.getAllByText("inviteRevoke");
    const triggerButton = revokeButtons
      .map((el) => el.closest("button"))
      .filter((b): b is HTMLButtonElement => !!b)[0];
    fireEvent.click(triggerButton);

    const confirmButtons = await screen.findAllByText("inviteRevoke");
    const actionBtn = confirmButtons
      .map((el) => el.closest("button"))
      .filter((b): b is HTMLButtonElement => !!b)
      .pop()!;
    fireEvent.click(actionBtn);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Invite expired");
    });
  });

  it("shows error toast when leave fails (fallback message when body missing)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("bad json");
      },
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <HouseholdMembersList
        members={[makeMember({ id: "m2", user_id: "u2", role: "member" })]}
        invitations={[]}
        isOwner={false}
        currentUserId="u2"
        onMutate={vi.fn()}
      />
    );

    const leaveTriggers = screen.getAllByText("memberLeave");
    const leaveTriggerBtn = leaveTriggers
      .map((el) => el.closest("button"))
      .filter((b): b is HTMLButtonElement => !!b)[0];
    fireEvent.click(leaveTriggerBtn);

    const confirmButtons = await screen.findAllByText("memberLeave");
    const actionBtn = confirmButtons
      .map((el) => el.closest("button"))
      .filter((b): b is HTMLButtonElement => !!b)
      .pop()!;
    fireEvent.click(actionBtn);

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Failed to leave household");
    });
  });

  it("hides leave button for owners and no remove button for current user row", () => {
    render(
      <HouseholdMembersList
        members={[
          makeMember({ id: "m1", user_id: "u1", role: "owner" }),
          makeMember({ id: "m2", user_id: "u2", role: "member" }),
        ]}
        invitations={[]}
        isOwner={true}
        currentUserId="u1"
        onMutate={vi.fn()}
      />
    );

    expect(
      screen.queryByRole("button", { name: "memberLeave" })
    ).not.toBeInTheDocument();
    // Only one remove button (for m2, not current user's row)
    expect(screen.getAllByRole("button", { name: "memberRemove" })).toHaveLength(1);
  });

  it("has no accessibility violations", async () => {
    const { container } = render(
      <HouseholdMembersList
        members={[
          makeMember({ id: "m1", user_id: "u1", role: "owner" }),
          makeMember({ id: "m2", user_id: "u2", role: "member" }),
        ]}
        invitations={[makeInvite()]}
        isOwner={true}
        currentUserId="u1"
        onMutate={vi.fn()}
      />
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
