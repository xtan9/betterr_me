import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const { mockUseTimezoneDetection, mockUseSWR } = vi.hoisted(() => ({
  mockUseTimezoneDetection: vi.fn(),
  mockUseSWR: vi.fn(),
}));

vi.mock("swr", () => ({
  default: mockUseSWR,
}));

vi.mock("@/lib/hooks/use-timezone-detection", () => ({
  useTimezoneDetection: mockUseTimezoneDetection,
}));

vi.mock("@/lib/fetcher", () => ({
  fetcher: vi.fn(),
}));

import { TimezoneDetector } from "@/components/timezone-detector";

describe("TimezoneDetector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call useTimezoneDetection with profile timezone from SWR", () => {
    mockUseSWR.mockReturnValue({
      data: { profile: { timezone: "America/New_York" } },
    });

    render(<TimezoneDetector />);

    expect(mockUseTimezoneDetection).toHaveBeenCalledWith("America/New_York");
  });

  it("should call useTimezoneDetection with undefined when SWR has no data", () => {
    mockUseSWR.mockReturnValue({ data: undefined });

    render(<TimezoneDetector />);

    expect(mockUseTimezoneDetection).toHaveBeenCalledWith(undefined);
  });

  it("should call useTimezoneDetection with null when profile timezone is null", () => {
    mockUseSWR.mockReturnValue({
      data: { profile: { timezone: null } },
    });

    render(<TimezoneDetector />);

    expect(mockUseTimezoneDetection).toHaveBeenCalledWith(null);
  });

  it("should render nothing", () => {
    mockUseSWR.mockReturnValue({ data: undefined });

    const { container } = render(<TimezoneDetector />);

    expect(container.innerHTML).toBe("");
  });

  it("should fetch /api/profile via SWR", () => {
    mockUseSWR.mockReturnValue({ data: undefined });

    render(<TimezoneDetector />);

    expect(mockUseSWR).toHaveBeenCalledWith("/api/profile", expect.any(Function));
  });
});
