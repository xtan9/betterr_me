import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Mock getLocalDateString
const { mockGetLocalDateString } = vi.hoisted(() => ({
  mockGetLocalDateString: vi.fn(() => "2026-02-23"),
}));
vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
  getLocalDateString: () => mockGetLocalDateString(),
}));

// Mock child components as stubs -- store callbacks for test invocation
let calendarOnDayClick: ((date: string) => void) | null = null;
let timelineOnEntryClick: ((date: string) => void) | null = null;
let modalOnOpenChange: ((open: boolean) => void) | null = null;

vi.mock("@/components/journal/journal-calendar", () => ({
  JournalCalendar: ({ onDayClick, refreshKey }: any) => {
    calendarOnDayClick = onDayClick;
    return React.createElement("div", {
      "data-testid": "journal-calendar",
      "data-refresh-key": refreshKey,
    });
  },
}));

vi.mock("@/components/journal/journal-timeline", () => ({
  JournalTimeline: ({ onEntryClick, refreshKey }: any) => {
    timelineOnEntryClick = onEntryClick;
    return React.createElement("div", {
      "data-testid": "journal-timeline",
      "data-refresh-key": refreshKey,
    });
  },
}));

vi.mock("@/components/journal/journal-entry-modal", () => ({
  JournalEntryModal: ({ open, onOpenChange, date }: any) => {
    modalOnOpenChange = onOpenChange;
    return open
      ? React.createElement("div", {
          "data-testid": "journal-entry-modal",
          "data-date": date,
        })
      : null;
  },
}));

vi.mock("@/components/layouts/page-header", () => ({
  PageHeader: ({ title, actions }: any) =>
    React.createElement("div", { "data-testid": "page-header" }, [
      React.createElement("h1", { key: "title" }, title),
      React.createElement("div", { key: "actions" }, actions),
    ]),
}));

import { JournalPageContent } from "@/app/journal/journal-page-content";

describe("JournalPageContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetLocalDateString.mockReturnValue("2026-02-23");
    calendarOnDayClick = null;
    timelineOnEntryClick = null;
    modalOnOpenChange = null;
  });

  it("renders page header with title and Write Today button", () => {
    render(<JournalPageContent />);

    expect(screen.getByText("pageTitle")).toBeInTheDocument();
    expect(screen.getByText("writeToday")).toBeInTheDocument();
  });

  it("renders Calendar and Timeline tabs", () => {
    render(<JournalPageContent />);

    expect(screen.getByRole("tab", { name: /calendar/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /timeline/i })).toBeInTheDocument();
  });

  it("calendar tab is active by default", () => {
    render(<JournalPageContent />);

    const calendarTab = screen.getByRole("tab", { name: /calendar/i });
    expect(calendarTab).toHaveAttribute("data-state", "active");
    expect(screen.getByTestId("journal-calendar")).toBeInTheDocument();
  });

  it("clicking Write Today opens the journal entry modal with today's date", async () => {
    const user = userEvent.setup();
    render(<JournalPageContent />);

    // Modal should not be open initially
    expect(screen.queryByTestId("journal-entry-modal")).not.toBeInTheDocument();

    // Click "Write Today" button
    await user.click(screen.getByText("writeToday"));

    // Modal should now be open with today's date
    const modal = screen.getByTestId("journal-entry-modal");
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute("data-date", "2026-02-23");
  });

  it("tab switching works - click Timeline tab activates it", async () => {
    const user = userEvent.setup();
    render(<JournalPageContent />);

    // Calendar tab should be active initially
    const calendarTab = screen.getByRole("tab", { name: /calendar/i });
    expect(calendarTab).toHaveAttribute("data-state", "active");

    // Click on Timeline tab using userEvent (needed for Radix)
    const timelineTab = screen.getByRole("tab", { name: /timeline/i });
    await user.click(timelineTab);

    // Timeline tab should now be active
    expect(timelineTab).toHaveAttribute("data-state", "active");
    expect(calendarTab).toHaveAttribute("data-state", "inactive");
  });

  it("calendar onDayClick opens modal with selected date", () => {
    render(<JournalPageContent />);

    // Simulate calendar day click via stored callback
    act(() => {
      calendarOnDayClick?.("2026-02-15");
    });

    const modal = screen.getByTestId("journal-entry-modal");
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute("data-date", "2026-02-15");
  });

  it("timeline onEntryClick opens modal with entry date", async () => {
    const user = userEvent.setup();
    render(<JournalPageContent />);

    // Switch to timeline tab so the mock renders and stores callback
    const timelineTab = screen.getByRole("tab", { name: /timeline/i });
    await user.click(timelineTab);

    // Now the timeline mock should have stored the callback
    expect(timelineOnEntryClick).not.toBeNull();

    // Simulate timeline entry click via stored callback
    act(() => {
      timelineOnEntryClick?.("2026-02-18");
    });

    const modal = screen.getByTestId("journal-entry-modal");
    expect(modal).toBeInTheDocument();
    expect(modal).toHaveAttribute("data-date", "2026-02-18");
  });

  it("closing modal increments refreshKey on calendar", async () => {
    const user = userEvent.setup();
    render(<JournalPageContent />);

    // Open modal via Write Today
    await user.click(screen.getByText("writeToday"));
    expect(screen.getByTestId("journal-entry-modal")).toBeInTheDocument();

    // Close modal via onOpenChange(false)
    act(() => {
      modalOnOpenChange?.(false);
    });

    // Modal should be closed
    expect(screen.queryByTestId("journal-entry-modal")).not.toBeInTheDocument();

    // Calendar refreshKey should have incremented from 0 to 1
    expect(screen.getByTestId("journal-calendar")).toHaveAttribute(
      "data-refresh-key",
      "1"
    );
  });

  it("tab panels have correct accessibility role", () => {
    render(<JournalPageContent />);

    // Radix Tabs renders tabpanel roles
    const tabpanels = screen.getAllByRole("tabpanel");
    expect(tabpanels.length).toBeGreaterThanOrEqual(1);
  });
});
