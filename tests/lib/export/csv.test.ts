import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  exportHabitsToCSV,
  exportLogsToCSV,
  generateExportFilename,
  type HabitLogWithName,
} from "@/lib/export/csv";
import type { Habit } from "@/lib/db/types";

describe("CSV Export Utilities", () => {
  describe("exportHabitsToCSV", () => {
    it("generates correct CSV header", () => {
      const habits: Habit[] = [];
      const csv = exportHabitsToCSV(habits);

      expect(csv).toBe(
        "id,name,description,category_id,frequency_type,frequency_details,status,current_streak,best_streak,created_at"
      );
    });

    it("exports daily habit correctly", () => {
      const habits: Habit[] = [
        {
          id: "habit-1",
          user_id: "user-1",
          name: "Morning Run",
          description: null,
          category_id: null,
          frequency: { type: "daily" },
          status: "active",
          current_streak: 5,
          best_streak: 10,
          paused_at: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        },
      ];

      const csv = exportHabitsToCSV(habits);
      const lines = csv.split("\n");

      expect(lines).toHaveLength(2);
      expect(lines[1]).toBe(
        "habit-1,Morning Run,,,daily,daily,active,5,10,2026-01-01T00:00:00Z"
      );
    });

    it("exports times_per_week habit correctly", () => {
      const habits: Habit[] = [
        {
          id: "habit-2",
          user_id: "user-1",
          name: "Gym",
          description: "Weight training",
          category_id: null,
          frequency: { type: "times_per_week", count: 3 },
          status: "active",
          current_streak: 2,
          best_streak: 8,
          paused_at: null,
          created_at: "2026-01-15T00:00:00Z",
          updated_at: "2026-01-15T00:00:00Z",
        },
      ];

      const csv = exportHabitsToCSV(habits);
      const lines = csv.split("\n");

      expect(lines[1]).toContain("times_per_week");
      expect(lines[1]).toContain("3x/week");
    });

    it("exports custom frequency habit correctly", () => {
      const habits: Habit[] = [
        {
          id: "habit-3",
          user_id: "user-1",
          name: "Weekend Reading",
          description: null,
          category_id: null,
          frequency: { type: "custom", days: [0, 6] },
          status: "active",
          current_streak: 3,
          best_streak: 5,
          paused_at: null,
          created_at: "2026-01-20T00:00:00Z",
          updated_at: "2026-01-20T00:00:00Z",
        },
      ];

      const csv = exportHabitsToCSV(habits);
      const lines = csv.split("\n");

      expect(lines[1]).toContain("custom");
      expect(lines[1]).toContain("custom:0;6");
    });

    it("escapes values with commas", () => {
      const habits: Habit[] = [
        {
          id: "habit-4",
          user_id: "user-1",
          name: "Read, Write, Learn",
          description: "Multiple activities, daily",
          category_id: null,
          frequency: { type: "daily" },
          status: "active",
          current_streak: 1,
          best_streak: 1,
          paused_at: null,
          created_at: "2026-02-01T00:00:00Z",
          updated_at: "2026-02-01T00:00:00Z",
        },
      ];

      const csv = exportHabitsToCSV(habits);

      // Values with commas should be quoted
      expect(csv).toContain('"Read, Write, Learn"');
      expect(csv).toContain('"Multiple activities, daily"');
    });

    it("escapes values with quotes", () => {
      const habits: Habit[] = [
        {
          id: "habit-5",
          user_id: "user-1",
          name: 'Read "The Book"',
          description: null,
          category_id: null,
          frequency: { type: "daily" },
          status: "active",
          current_streak: 0,
          best_streak: 0,
          paused_at: null,
          created_at: "2026-02-01T00:00:00Z",
          updated_at: "2026-02-01T00:00:00Z",
        },
      ];

      const csv = exportHabitsToCSV(habits);

      // Quotes should be escaped by doubling
      expect(csv).toContain('"Read ""The Book"""');
    });
  });

  describe("exportLogsToCSV", () => {
    it("generates correct CSV header", () => {
      const logs: HabitLogWithName[] = [];
      const csv = exportLogsToCSV(logs);

      expect(csv).toBe("habit_id,habit_name,logged_date,completed");
    });

    it("exports logs with habit names", () => {
      const logs: HabitLogWithName[] = [
        {
          id: "log-1",
          habit_id: "habit-1",
          user_id: "user-1",
          logged_date: "2026-02-01",
          completed: true,
          habit_name: "Morning Run",
          created_at: "2026-02-01T08:00:00Z",
          updated_at: "2026-02-01T08:00:00Z",
        },
        {
          id: "log-2",
          habit_id: "habit-1",
          user_id: "user-1",
          logged_date: "2026-02-02",
          completed: false,
          habit_name: "Morning Run",
          created_at: "2026-02-02T08:00:00Z",
          updated_at: "2026-02-02T08:00:00Z",
        },
      ];

      const csv = exportLogsToCSV(logs);
      const lines = csv.split("\n");

      expect(lines).toHaveLength(3);
      expect(lines[1]).toBe("habit-1,Morning Run,2026-02-01,true");
      expect(lines[2]).toBe("habit-1,Morning Run,2026-02-02,false");
    });
  });

  describe("generateExportFilename", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-02-05"));
    });

    it("generates habits filename with date", () => {
      const filename = generateExportFilename("habits");
      expect(filename).toBe("betterrme-habits-2026-02-05.csv");
    });

    it("generates logs filename with date", () => {
      const filename = generateExportFilename("logs");
      expect(filename).toBe("betterrme-logs-2026-02-05.csv");
    });
  });
});
