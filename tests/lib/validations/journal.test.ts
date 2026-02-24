import { describe, it, expect } from "vitest";
import {
  journalEntryFormSchema,
  journalEntryUpdateSchema,
  journalLinkSchema,
} from "@/lib/validations/journal";

const validEntry = (overrides: Record<string, unknown> = {}) => ({
  entry_date: "2026-02-23",
  ...overrides,
});

describe("journalEntryFormSchema", () => {
  describe("entry_date", () => {
    it("accepts valid YYYY-MM-DD", () => {
      const result = journalEntryFormSchema.safeParse(validEntry());
      expect(result.success).toBe(true);
    });

    it("rejects invalid date format", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ entry_date: "23-02-2026" }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects missing entry_date", () => {
      const result = journalEntryFormSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe("title", () => {
    it("defaults to empty string", () => {
      const result = journalEntryFormSchema.safeParse(validEntry());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("");
      }
    });

    it("trims whitespace", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ title: "  Hello  " }),
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Hello");
      }
    });

    it("accepts title at 200 characters", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ title: "a".repeat(200) }),
      );
      expect(result.success).toBe(true);
    });

    it("rejects title over 200 characters", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ title: "a".repeat(201) }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("content", () => {
    it("defaults to empty doc", () => {
      const result = journalEntryFormSchema.safeParse(validEntry());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.content).toEqual({ type: "doc", content: [] });
      }
    });

    it("accepts Tiptap JSON content", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ content: { type: "doc", content: [{ type: "paragraph" }] } }),
      );
      expect(result.success).toBe(true);
    });
  });

  describe("mood", () => {
    it("defaults to null", () => {
      const result = journalEntryFormSchema.safeParse(validEntry());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.mood).toBeNull();
      }
    });

    it("accepts null explicitly", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ mood: null }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts mood values 1-5", () => {
      for (let i = 1; i <= 5; i++) {
        const result = journalEntryFormSchema.safeParse(
          validEntry({ mood: i }),
        );
        expect(result.success).toBe(true);
      }
    });

    it("rejects mood value 0", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ mood: 0 }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects mood value 6", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ mood: 6 }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects non-integer mood", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ mood: 3.5 }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("word_count", () => {
    it("defaults to 0", () => {
      const result = journalEntryFormSchema.safeParse(validEntry());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.word_count).toBe(0);
      }
    });

    it("rejects negative word_count", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ word_count: -1 }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("tags", () => {
    it("defaults to empty array", () => {
      const result = journalEntryFormSchema.safeParse(validEntry());
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tags).toEqual([]);
      }
    });

    it("accepts valid tags", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ tags: ["journal", "daily"] }),
      );
      expect(result.success).toBe(true);
    });

    it("rejects more than 20 tags", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ tags: Array.from({ length: 21 }, (_, i) => `tag${i}`) }),
      );
      expect(result.success).toBe(false);
    });

    it("rejects tag over 50 characters", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ tags: ["a".repeat(51)] }),
      );
      expect(result.success).toBe(false);
    });
  });

  describe("prompt_key", () => {
    it("defaults to undefined (optional)", () => {
      const result = journalEntryFormSchema.safeParse(validEntry());
      expect(result.success).toBe(true);
    });

    it("accepts null", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ prompt_key: null }),
      );
      expect(result.success).toBe(true);
    });

    it("accepts valid prompt_key", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ prompt_key: "gratitude01" }),
      );
      expect(result.success).toBe(true);
    });

    it("rejects prompt_key over 100 characters", () => {
      const result = journalEntryFormSchema.safeParse(
        validEntry({ prompt_key: "a".repeat(101) }),
      );
      expect(result.success).toBe(false);
    });
  });
});

describe("journalEntryUpdateSchema", () => {
  it("rejects empty body", () => {
    const result = journalEntryUpdateSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("does not allow entry_date", () => {
    // entry_date is omitted from the update schema
    const result = journalEntryUpdateSchema.safeParse({
      title: "Updated title",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect((result.data as Record<string, unknown>).entry_date).toBeUndefined();
    }
  });

  it("accepts single-field update (title only)", () => {
    const result = journalEntryUpdateSchema.safeParse({ title: "New Title" });
    expect(result.success).toBe(true);
  });

  it("accepts single-field update (mood only)", () => {
    const result = journalEntryUpdateSchema.safeParse({ mood: 4 });
    expect(result.success).toBe(true);
  });

  it("accepts single-field update (content only)", () => {
    const result = journalEntryUpdateSchema.safeParse({
      content: { type: "doc", content: [] },
    });
    expect(result.success).toBe(true);
  });
});

describe("journalLinkSchema", () => {
  it("accepts valid habit link", () => {
    const result = journalLinkSchema.safeParse({
      link_type: "habit",
      link_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid task link", () => {
    const result = journalLinkSchema.safeParse({
      link_type: "task",
      link_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid project link", () => {
    const result = journalLinkSchema.safeParse({
      link_type: "project",
      link_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid link_type", () => {
    const result = journalLinkSchema.safeParse({
      link_type: "note",
      link_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-UUID link_id", () => {
    const result = journalLinkSchema.safeParse({
      link_type: "habit",
      link_id: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing link_type", () => {
    const result = journalLinkSchema.safeParse({
      link_id: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing link_id", () => {
    const result = journalLinkSchema.safeParse({
      link_type: "habit",
    });
    expect(result.success).toBe(false);
  });
});
