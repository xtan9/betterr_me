import { describe, it, expect } from "vitest";
import { saveMessageSchema, titleRequestSchema } from "@/lib/validations/chat";

describe("saveMessageSchema", () => {
  it("accepts valid user message", () => {
    const result = saveMessageSchema.safeParse({
      role: "user",
      content: "Hello",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid assistant message", () => {
    const result = saveMessageSchema.safeParse({
      role: "assistant",
      content: "Hi there!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects system role", () => {
    const result = saveMessageSchema.safeParse({
      role: "system",
      content: "You are a helpful assistant.",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid role", () => {
    const result = saveMessageSchema.safeParse({
      role: "admin",
      content: "Hello",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty content", () => {
    const result = saveMessageSchema.safeParse({
      role: "user",
      content: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("empty");
    }
  });

  it("rejects content over 32000 characters", () => {
    const result = saveMessageSchema.safeParse({
      role: "user",
      content: "a".repeat(32001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("too long");
    }
  });
});

describe("titleRequestSchema", () => {
  it("accepts valid title request", () => {
    const result = titleRequestSchema.safeParse({
      userMessage: "Hello",
      assistantMessage: "Hi there!",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty userMessage", () => {
    const result = titleRequestSchema.safeParse({
      userMessage: "",
      assistantMessage: "Hi",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty assistantMessage", () => {
    const result = titleRequestSchema.safeParse({
      userMessage: "Hello",
      assistantMessage: "",
    });
    expect(result.success).toBe(false);
  });
});
