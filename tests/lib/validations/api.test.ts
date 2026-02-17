import { describe, it, expect, vi } from "vitest";
import { validateRequestBody } from "@/lib/validations/api";
import { habitUpdateSchema } from "@/lib/validations/habit";

// Suppress log.warn output in tests
vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

describe("validateRequestBody", () => {
  describe("success path", () => {
    it("returns parsed data on valid input", () => {
      const result = validateRequestBody(
        { name: "  My Habit  ", frequency: { type: "daily" } },
        habitUpdateSchema,
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("My Habit"); // trimmed by Zod
      }
    });
  });

  describe("field-level errors", () => {
    it("returns field errors for invalid fields", async () => {
      const result = validateRequestBody(
        { name: "", frequency: { type: "daily" } },
        habitUpdateSchema,
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        const body = await result.response.json();
        expect(body.error).toBe("Validation failed");
        expect(body.details).toBeDefined();
      }
    });
  });

  describe("refine-level errors", () => {
    it("returns a useful error message for empty body (refine error)", async () => {
      const result = validateRequestBody({}, habitUpdateSchema);
      expect(result.success).toBe(false);
      if (!result.success) {
        const body = await result.response.json();
        expect(result.response.status).toBe(400);
        expect(body.error).toBe("Validation failed");
        // This is the critical assertion — refine errors must NOT be empty
        expect(body.details).toBeDefined();
        const detailsStr = JSON.stringify(body.details);
        expect(detailsStr).toContain("At least one field");
      }
    });
  });

  describe("response shape", () => {
    it("returns 400 status on failure", async () => {
      const result = validateRequestBody({}, habitUpdateSchema);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response.status).toBe(400);
      }
    });
  });
});
