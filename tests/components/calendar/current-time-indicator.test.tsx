import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { CurrentTimeIndicator } from "@/components/calendar/current-time-indicator";

describe("CurrentTimeIndicator", () => {
  beforeEach(() => {
    // Mock Date to 10:30 AM
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 1, 10, 30, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders with correct top position", () => {
    // 10:30 AM = (10 + 30/60) * 48 = 10.5 * 48 = 504px
    const { container } = render(<CurrentTimeIndicator />);
    const indicator = container.firstChild as HTMLElement;
    expect(indicator.style.top).toBe("504px");
  });

  it("has aria-hidden=true", () => {
    const { container } = render(<CurrentTimeIndicator />);
    const indicator = container.firstChild as HTMLElement;
    expect(indicator.getAttribute("aria-hidden")).toBe("true");
  });

  it("has pointer-events-none class", () => {
    const { container } = render(<CurrentTimeIndicator />);
    const indicator = container.firstChild as HTMLElement;
    expect(indicator.className).toContain("pointer-events-none");
  });

  it("uses calendar-event CSS variable for color", () => {
    const { container } = render(<CurrentTimeIndicator />);
    // The circle and line should use bg-[hsl(var(--calendar-event))]
    const circle = container.querySelector(".rounded-full");
    expect(circle).not.toBeNull();
    expect(circle!.className).toContain("calendar-event");
  });

  it("sets up a 60-second interval for updates", () => {
    const setIntervalSpy = vi.spyOn(global, "setInterval");
    render(<CurrentTimeIndicator />);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60000);
    setIntervalSpy.mockRestore();
  });
});
