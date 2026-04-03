import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isInQuietHours } from "@/lib/push/quiet-hours";

describe("isInQuietHours", () => {
  let originalDateTimeFormat: typeof Intl.DateTimeFormat;

  beforeEach(() => {
    originalDateTimeFormat = Intl.DateTimeFormat;
  });

  afterEach(() => {
    Intl.DateTimeFormat = originalDateTimeFormat;
  });

  function mockCurrentTime(time: string) {
    // Use a proper constructor function that works with `new`
    function MockDateTimeFormat() {
      return { format: () => time };
    }
    MockDateTimeFormat.prototype = originalDateTimeFormat.prototype;
    MockDateTimeFormat.supportedLocalesOf = originalDateTimeFormat.supportedLocalesOf;
    Intl.DateTimeFormat = MockDateTimeFormat as unknown as typeof Intl.DateTimeFormat;
  }

  function mockCurrentTimeWithSpy(time: string) {
    const calls: Array<[string, Intl.DateTimeFormatOptions]> = [];
    function MockDateTimeFormat(locale: string, options: Intl.DateTimeFormatOptions) {
      calls.push([locale, options]);
      return { format: () => time };
    }
    MockDateTimeFormat.prototype = originalDateTimeFormat.prototype;
    MockDateTimeFormat.supportedLocalesOf = originalDateTimeFormat.supportedLocalesOf;
    Intl.DateTimeFormat = MockDateTimeFormat as unknown as typeof Intl.DateTimeFormat;
    return calls;
  }

  it("returns false when quiet hours are not configured (null)", () => {
    expect(isInQuietHours(null, null, "America/New_York")).toBe(false);
  });

  it("returns false when quiet hours are not configured (undefined)", () => {
    expect(isInQuietHours(undefined, undefined, "America/New_York")).toBe(false);
  });

  it("returns false when only start is set", () => {
    expect(isInQuietHours("22:00", null, "America/New_York")).toBe(false);
  });

  describe("same-day range (09:00-17:00)", () => {
    it("returns true when current time is inside range", () => {
      mockCurrentTime("12:00");
      expect(isInQuietHours("09:00", "17:00", "America/New_York")).toBe(true);
    });

    it("returns false when current time is outside range", () => {
      mockCurrentTime("08:00");
      expect(isInQuietHours("09:00", "17:00", "America/New_York")).toBe(false);
    });

    it("returns true at exact start time", () => {
      mockCurrentTime("09:00");
      expect(isInQuietHours("09:00", "17:00", "America/New_York")).toBe(true);
    });

    it("returns false at exact end time", () => {
      mockCurrentTime("17:00");
      expect(isInQuietHours("09:00", "17:00", "America/New_York")).toBe(false);
    });
  });

  describe("overnight range (22:00-07:00)", () => {
    it("returns true at 23:00", () => {
      mockCurrentTime("23:00");
      expect(isInQuietHours("22:00", "07:00", "America/New_York")).toBe(true);
    });

    it("returns false at 12:00", () => {
      mockCurrentTime("12:00");
      expect(isInQuietHours("22:00", "07:00", "America/New_York")).toBe(false);
    });

    it("returns true at 06:59", () => {
      mockCurrentTime("06:59");
      expect(isInQuietHours("22:00", "07:00", "America/New_York")).toBe(true);
    });

    it("returns true at exact start (22:00)", () => {
      mockCurrentTime("22:00");
      expect(isInQuietHours("22:00", "07:00", "America/New_York")).toBe(true);
    });

    it("returns false at exact end (07:00)", () => {
      mockCurrentTime("07:00");
      expect(isInQuietHours("22:00", "07:00", "America/New_York")).toBe(false);
    });
  });

  it("falls back to UTC when timezone is null", () => {
    mockCurrentTime("23:30");
    const result = isInQuietHours("22:00", "07:00", null);
    expect(result).toBe(true);
  });

  it("passes timezone to Intl.DateTimeFormat", () => {
    const calls = mockCurrentTimeWithSpy("12:00");
    isInQuietHours("22:00", "07:00", "Asia/Tokyo");
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe("en-US");
    expect(calls[0][1]).toEqual(expect.objectContaining({
      timeZone: "Asia/Tokyo",
    }));
  });

  it("uses UTC when timezone is null", () => {
    const calls = mockCurrentTimeWithSpy("12:00");
    isInQuietHours("22:00", "07:00", null);
    expect(calls.length).toBe(1);
    expect(calls[0][0]).toBe("en-US");
    expect(calls[0][1]).toEqual(expect.objectContaining({
      timeZone: "UTC",
    }));
  });
});
