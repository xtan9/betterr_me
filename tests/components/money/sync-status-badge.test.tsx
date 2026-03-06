import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import * as matchers from "vitest-axe/matchers";
import { SyncStatusBadge } from "@/components/money/sync-status-badge";

expect.extend(matchers);

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("SyncStatusBadge", () => {
  it("renders syncing variant with spinner icon", () => {
    render(<SyncStatusBadge status="syncing" />);

    expect(screen.getByText("syncStatus.syncing")).toBeInTheDocument();
    // The Loader2 spinner should be present as an SVG with animate-spin
    const badge = screen.getByText("syncStatus.syncing").closest("span");
    expect(badge).toBeInTheDocument();
    const spinner = badge?.querySelector("svg");
    expect(spinner).toBeInTheDocument();
    expect(spinner?.classList.contains("animate-spin")).toBe(true);
  });

  it("renders synced variant with correct styling", () => {
    render(<SyncStatusBadge status="synced" />);

    const badge = screen.getByText("syncStatus.synced").closest("span");
    expect(badge).toBeInTheDocument();
    expect(badge?.className).toContain("bg-money-sage-light");
    expect(badge?.className).toContain("text-money-sage-foreground");
    // No spinner for synced
    const spinner = badge?.querySelector("svg");
    expect(spinner).toBeNull();
  });

  it("renders stale variant with correct styling", () => {
    render(<SyncStatusBadge status="stale" />);

    const badge = screen.getByText("syncStatus.stale").closest("span");
    expect(badge).toBeInTheDocument();
    expect(badge?.className).toContain("bg-money-amber-light");
    expect(badge?.className).toContain("text-money-amber-foreground");
  });

  it("renders error variant with correct styling", () => {
    render(<SyncStatusBadge status="error" />);

    const badge = screen.getByText("syncStatus.error").closest("span");
    expect(badge).toBeInTheDocument();
    expect(badge?.className).toContain("text-destructive");
  });

  it("has no accessibility violations", async () => {
    const { container } = render(<SyncStatusBadge status="synced" />);

    expect(await axe(container)).toHaveNoViolations();
  });
});
