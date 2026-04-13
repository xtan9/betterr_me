import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { ApiKeyRow } from "@/components/settings/api-key-row";
import type { ApiKeyPublic } from "@/lib/db/types";

expect.extend(matchers);

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

function makeKey(overrides: Partial<ApiKeyPublic> = {}): ApiKeyPublic {
  return {
    id: "key-1",
    name: "My Key",
    key_prefix: "bru_abc123",
    permissions: "read_write",
    created_at: "2026-01-01T00:00:00Z",
    last_used_at: null,
    expires_at: null,
    ...overrides,
  } as ApiKeyPublic;
}

describe("ApiKeyRow", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-12T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders name, prefix, and read_write badge", () => {
    render(<ApiKeyRow apiKey={makeKey()} onDelete={vi.fn()} />);
    expect(screen.getByText("My Key")).toBeInTheDocument();
    expect(screen.getByText("bru_abc123...")).toBeInTheDocument();
    expect(screen.getByText("permissionReadWrite")).toBeInTheDocument();
  });

  it("renders read-only badge label for read permission", () => {
    render(
      <ApiKeyRow apiKey={makeKey({ permissions: "read" })} onDelete={vi.fn()} />,
    );
    expect(screen.getByText("permissionRead")).toBeInTheDocument();
  });

  it("renders 'never' when last_used_at is null", () => {
    render(<ApiKeyRow apiKey={makeKey()} onDelete={vi.fn()} />);
    expect(screen.getByText(/lastUsedNever/)).toBeInTheDocument();
  });

  it("formats last used as 'Today' for same day", () => {
    render(
      <ApiKeyRow
        apiKey={makeKey({ last_used_at: "2026-04-12T09:00:00Z" })}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/Today/)).toBeInTheDocument();
  });

  it("formats last used in days when < 30 days ago", () => {
    render(
      <ApiKeyRow
        apiKey={makeKey({ last_used_at: "2026-04-07T12:00:00Z" })}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/5 days ago/)).toBeInTheDocument();
  });

  it("formats last used in months when 30-364 days ago", () => {
    render(
      <ApiKeyRow
        apiKey={makeKey({ last_used_at: "2026-01-01T12:00:00Z" })}
        onDelete={vi.fn()}
      />,
    );
    // Jan 1 to Apr 12 = 101 days / 30 = 3 months
    expect(screen.getByText(/3 months ago/)).toBeInTheDocument();
  });

  it("formats last used in years when 365+ days ago", () => {
    render(
      <ApiKeyRow
        apiKey={makeKey({ last_used_at: "2024-01-01T12:00:00Z" })}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/years ago/)).toBeInTheDocument();
  });

  it("renders expires_at when present", () => {
    render(
      <ApiKeyRow
        apiKey={makeKey({ expires_at: "2027-01-01T00:00:00Z" })}
        onDelete={vi.fn()}
      />,
    );
    expect(screen.getByText(/expiresAt/)).toBeInTheDocument();
  });

  it("calls onDelete with the key id when confirm is clicked", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<ApiKeyRow apiKey={makeKey({ id: "delete-me" })} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "delete" }));
    // Confirm inside the dialog — there will now be a second "delete" button
    const confirmBtn = await screen.findByRole("button", { name: "delete", hidden: false });
    // findByRole returns the last matched? Use getAllByRole to be safe:
    const allDeletes = screen.getAllByRole("button", { name: "delete" });
    await user.click(allDeletes[allDeletes.length - 1]);

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith("delete-me");
    });
    void confirmBtn;
  });

  it("has no accessibility violations", { timeout: 15000 }, async () => {
    vi.useRealTimers();
    const { container } = render(
      <ApiKeyRow apiKey={makeKey()} onDelete={vi.fn()} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
