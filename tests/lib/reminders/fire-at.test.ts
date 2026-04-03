import { describe, it, expect } from "vitest";
import { computeFireAt, type FireAtInput } from "@/lib/reminders/fire-at";

describe("computeFireAt", () => {
  describe("relative reminders", () => {
    it("computes fire_at 15 minutes before event start", () => {
      const input: FireAtInput = {
        reminder_type: "relative",
        relative_minutes: 15,
        absolute_time: null,
      };
      expect(computeFireAt(input, "2026-04-10T14:00:00Z")).toBe(
        "2026-04-10T13:45:00.000Z"
      );
    });

    it("computes fire_at 1440 minutes (1 day) before event start", () => {
      const input: FireAtInput = {
        reminder_type: "relative",
        relative_minutes: 1440,
        absolute_time: null,
      };
      expect(computeFireAt(input, "2026-04-10T14:00:00Z")).toBe(
        "2026-04-09T14:00:00.000Z"
      );
    });

    it("handles all-day events (midnight anchor)", () => {
      const input: FireAtInput = {
        reminder_type: "relative",
        relative_minutes: 60,
        absolute_time: null,
      };
      expect(computeFireAt(input, "2026-04-10T00:00:00Z")).toBe(
        "2026-04-09T23:00:00.000Z"
      );
    });

    it("throws for relative with null minutes", () => {
      const input: FireAtInput = {
        reminder_type: "relative",
        relative_minutes: null,
        absolute_time: null,
      };
      expect(() => computeFireAt(input, "2026-04-10T14:00:00Z")).toThrow(
        "Invalid reminder: missing relative_minutes or absolute_time"
      );
    });
  });

  describe("absolute reminders", () => {
    it("returns absolute_time directly as ISO string", () => {
      const input: FireAtInput = {
        reminder_type: "absolute",
        relative_minutes: null,
        absolute_time: "2026-04-10T08:00:00Z",
      };
      expect(computeFireAt(input, "2026-04-10T14:00:00Z")).toBe(
        "2026-04-10T08:00:00.000Z"
      );
    });

    it("throws for absolute with null time", () => {
      const input: FireAtInput = {
        reminder_type: "absolute",
        relative_minutes: null,
        absolute_time: null,
      };
      expect(() => computeFireAt(input, "2026-04-10T14:00:00Z")).toThrow(
        "Invalid reminder: missing relative_minutes or absolute_time"
      );
    });
  });
});
