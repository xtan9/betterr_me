import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks ---

const { mockReplace, mockPush, mockSearchParams } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockPush: vi.fn(),
  mockSearchParams: new URLSearchParams(),
}));

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
  usePathname: () => "/calendar",
}));

// Mock next-intl
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// Mock SWR
vi.mock("swr", () => ({
  default: () => ({ data: null, error: null, isLoading: true }),
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));

// Mock lib/fetcher
vi.mock("@/lib/fetcher", () => ({
  fetcher: vi.fn(),
}));

// Mock child components to avoid rendering full UI
vi.mock("@/components/calendar/calendar-header", () => ({
  CalendarHeader: () => <div data-testid="calendar-header" />,
}));
vi.mock("@/components/calendar/calendar-sidebar", () => ({
  CalendarSidebar: () => <div data-testid="calendar-sidebar" />,
  LAYERS: [
    { key: "events", cssVar: "--calendar-event" },
    { key: "tasks", cssVar: "--calendar-task" },
    { key: "habits", cssVar: "--calendar-habit" },
    { key: "workouts", cssVar: "--calendar-workout" },
  ],
}));
vi.mock("@/components/calendar/month-grid", () => ({
  MonthGrid: () => <div data-testid="month-grid" />,
}));
vi.mock("@/components/calendar/week-view", () => ({
  WeekView: () => <div data-testid="week-view" />,
}));
vi.mock("@/components/calendar/day-view", () => ({
  DayView: () => <div data-testid="day-view" />,
}));
vi.mock("@/components/calendar/event-quick-create", () => ({
  EventQuickCreate: () => null,
}));
vi.mock("@/components/calendar/event-dialog", () => ({
  EventDialog: () => null,
}));
vi.mock("@/hooks/use-keyboard-shortcuts", () => ({
  useKeyboardShortcuts: vi.fn(),
}));

import { render } from "@testing-library/react";
import { CalendarPageContent } from "@/components/calendar/calendar-page-content";

describe("CalendarPageContent default view routing (VIEW-11)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset searchParams to have no ?view=
    mockSearchParams.delete("view");
    mockSearchParams.delete("date");
  });

  it("defaults to week view on desktop (min-width: 768px matches)", () => {
    // Mock matchMedia to return desktop
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(min-width: 768px)",
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(<CalendarPageContent />);

    // Should call router.replace with view=week
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("view=week"),
    );
  });

  it("defaults to day view on mobile (min-width: 768px does not match)", () => {
    // Mock matchMedia to return mobile
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(<CalendarPageContent />);

    // Should call router.replace with view=day
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("view=day"),
    );
  });

  it("does not redirect when ?view= param is already set", () => {
    mockSearchParams.set("view", "month");

    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: true,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    render(<CalendarPageContent />);

    // Should not call router.replace (no default view redirect)
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
