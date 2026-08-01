import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const { mockUseTimezoneDetection, mockUseUserTimeZone } = vi.hoisted(() => ({
  mockUseTimezoneDetection: vi.fn(),
  mockUseUserTimeZone: vi.fn(),
}));

vi.mock("@/lib/hooks/use-timezone-detection", () => ({
  useTimezoneDetection: mockUseTimezoneDetection,
}));

vi.mock("@/lib/hooks/use-profile-preferences", () => ({
  useUserTimeZone: mockUseUserTimeZone,
}));

import { TimezoneDetector } from "@/components/timezone-detector";

describe("TimezoneDetector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUserTimeZone.mockReturnValue({
      timeZone: { status: "resolved", value: "America/New_York" },
      setUserTimeZone: vi.fn(),
    });
  });

  it("should call useTimezoneDetection with the resolved profile timezone", () => {
    render(<TimezoneDetector />);

    expect(mockUseTimezoneDetection).toHaveBeenCalledWith(
      "America/New_York",
      expect.any(Function),
    );
  });

  it("should call useTimezoneDetection with null when the timezone is unresolved", () => {
    mockUseUserTimeZone.mockReturnValue({
      timeZone: { status: "unresolved" },
      setUserTimeZone: vi.fn(),
    });

    render(<TimezoneDetector />);

    expect(mockUseTimezoneDetection).toHaveBeenCalledWith(null, expect.any(Function));
  });

  it("should render nothing", () => {
    const { container } = render(<TimezoneDetector />);

    expect(container.innerHTML).toBe("");
  });
});
