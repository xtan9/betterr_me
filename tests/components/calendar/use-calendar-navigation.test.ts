import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCalendarNavigation } from "@/components/calendar/use-calendar-navigation";

const mockPush = vi.fn();
const mockReplace = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  usePathname: () => "/calendar",
}));

// Partial mock: pass through every real export, override only the
// "no-arg today" case with a fixed date. Using toISOString() here would be
// timezone-dependent (CLAUDE.md explicitly calls this out as a bug pattern).
vi.mock("@/lib/utils", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
  return {
    ...actual,
    getLocalDateString: (d?: Date) =>
      d === undefined ? "2026-04-17" : actual.getLocalDateString(d),
  };
});

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockSearchParams = new URLSearchParams();
});

describe("useCalendarNavigation", () => {
  it('returns "month" as default view when no params', () => {
    const { result } = renderHook(() => useCalendarNavigation());
    expect(result.current.view).toBe("month");
  });

  it("returns correct view from URL params", () => {
    mockSearchParams = new URLSearchParams("view=week&date=2026-04-17");
    const { result } = renderHook(() => useCalendarNavigation());
    expect(result.current.view).toBe("week");
  });

  it('falls back to "month" for invalid view param', () => {
    mockSearchParams = new URLSearchParams("view=invalid&date=2026-04-17");
    const { result } = renderHook(() => useCalendarNavigation());
    expect(result.current.view).toBe("month");
  });

  it("returns today's date when no date param", () => {
    const { result } = renderHook(() => useCalendarNavigation());
    expect(result.current.dateParam).toBe("2026-04-17");
  });

  it("returns date from URL when valid format", () => {
    mockSearchParams = new URLSearchParams("date=2026-03-15");
    const { result } = renderHook(() => useCalendarNavigation());
    expect(result.current.dateParam).toBe("2026-03-15");
  });

  it("falls back to today for invalid date format", () => {
    mockSearchParams = new URLSearchParams("date=not-a-date");
    const { result } = renderHook(() => useCalendarNavigation());
    expect(result.current.dateParam).toBe("2026-04-17");
  });

  it("goToToday calls router.push with today's date", () => {
    mockSearchParams = new URLSearchParams("date=2026-03-01");
    const { result } = renderHook(() => useCalendarNavigation());
    act(() => {
      result.current.goToToday();
    });
    expect(mockPush).toHaveBeenCalledWith("/calendar?date=2026-04-17");
  });

  it("goToPrev in day view subtracts 1 day", () => {
    mockSearchParams = new URLSearchParams("view=day&date=2026-04-17");
    const { result } = renderHook(() => useCalendarNavigation());
    act(() => {
      result.current.goToPrev();
    });
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("date=2026-04-16")
    );
  });

  it("goToPrev in week view subtracts 7 days", () => {
    mockSearchParams = new URLSearchParams("view=week&date=2026-04-17");
    const { result } = renderHook(() => useCalendarNavigation());
    act(() => {
      result.current.goToPrev();
    });
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("date=2026-04-10")
    );
  });

  it("goToPrev in month view goes to previous month", () => {
    mockSearchParams = new URLSearchParams("view=month&date=2026-04-17");
    const { result } = renderHook(() => useCalendarNavigation());
    act(() => {
      result.current.goToPrev();
    });
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("date=2026-03-01")
    );
  });

  it("goToNext in day view adds 1 day", () => {
    mockSearchParams = new URLSearchParams("view=day&date=2026-04-17");
    const { result } = renderHook(() => useCalendarNavigation());
    act(() => {
      result.current.goToNext();
    });
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("date=2026-04-18")
    );
  });

  it("goToNext in week view adds 7 days", () => {
    mockSearchParams = new URLSearchParams("view=week&date=2026-04-17");
    const { result } = renderHook(() => useCalendarNavigation());
    act(() => {
      result.current.goToNext();
    });
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("date=2026-04-24")
    );
  });

  it("goToNext in month view goes to next month", () => {
    mockSearchParams = new URLSearchParams("view=month&date=2026-04-17");
    const { result } = renderHook(() => useCalendarNavigation());
    act(() => {
      result.current.goToNext();
    });
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("date=2026-05-01")
    );
  });

  it("goToPrev in month view with January wraps to December of previous year", () => {
    mockSearchParams = new URLSearchParams("view=month&date=2026-01-10");
    const { result } = renderHook(() => useCalendarNavigation());
    act(() => {
      result.current.goToPrev();
    });
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("date=2025-12-01")
    );
  });

  it("goToNext in month view with December wraps to January of next year", () => {
    mockSearchParams = new URLSearchParams("view=month&date=2026-12-15");
    const { result } = renderHook(() => useCalendarNavigation());
    act(() => {
      result.current.goToNext();
    });
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("date=2027-01-01")
    );
  });

  it("setView updates URL with new view param", () => {
    mockSearchParams = new URLSearchParams("date=2026-04-17");
    const { result } = renderHook(() => useCalendarNavigation());
    act(() => {
      result.current.setView("week");
    });
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("view=week")
    );
  });

  it("navigateToDate updates date param", () => {
    mockSearchParams = new URLSearchParams("date=2026-04-17");
    const { result } = renderHook(() => useCalendarNavigation());
    act(() => {
      result.current.navigateToDate(new Date(2026, 5, 1)); // June 1 2026
    });
    expect(mockPush).toHaveBeenCalledWith(
      expect.stringContaining("date=2026-06-01")
    );
  });

  it("navigateToDate with undefined does nothing", () => {
    mockSearchParams = new URLSearchParams("date=2026-04-17");
    const { result } = renderHook(() => useCalendarNavigation());
    act(() => {
      result.current.navigateToDate(undefined);
    });
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("handleDayClick sets view=day and the selected date", () => {
    mockSearchParams = new URLSearchParams("view=month&date=2026-04-01");
    const { result } = renderHook(() => useCalendarNavigation());
    act(() => {
      result.current.handleDayClick(new Date(2026, 3, 17)); // April 17 2026
    });
    const pushCall = mockPush.mock.calls[0]?.[0] ?? "";
    expect(pushCall).toContain("view=day");
    expect(pushCall).toContain("date=2026-04-17");
  });

  it("updateParams with replace:true uses router.replace", () => {
    mockSearchParams = new URLSearchParams("date=2026-04-17");
    const { result } = renderHook(() => useCalendarNavigation());
    act(() => {
      result.current.updateParams({ view: "week" }, { replace: true });
    });
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("view=week")
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("year and month are correctly parsed from date param", () => {
    mockSearchParams = new URLSearchParams("date=2025-11-20");
    const { result } = renderHook(() => useCalendarNavigation());
    expect(result.current.year).toBe(2025);
    expect(result.current.month).toBe(10); // 0-indexed November
  });

  it("currentDate is constructed from date param", () => {
    mockSearchParams = new URLSearchParams("date=2026-06-15");
    const { result } = renderHook(() => useCalendarNavigation());
    const d = result.current.currentDate;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // June = 5
    expect(d.getDate()).toBe(15);
  });
});
