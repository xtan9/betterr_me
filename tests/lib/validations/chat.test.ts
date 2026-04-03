import { describe, it, expect } from "vitest";
import { chatMessageSchema, sendChatSchema } from "@/lib/validations/chat";

describe("chatMessageSchema", () => {
  it("accepts valid user message", () => {
    const result = chatMessageSchema.safeParse({
      role: "user",
      content: "Hello",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid assistant message", () => {
    const result = chatMessageSchema.safeParse({
      role: "assistant",
      content: "Hi there!",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid system message", () => {
    const result = chatMessageSchema.safeParse({
      role: "system",
      content: "You are a helpful assistant.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid role", () => {
    const result = chatMessageSchema.safeParse({
      role: "admin",
      content: "Hello",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty content", () => {
    const result = chatMessageSchema.safeParse({
      role: "user",
      content: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("empty");
    }
  });

  it("rejects content over 32000 characters", () => {
    const result = chatMessageSchema.safeParse({
      role: "user",
      content: "a".repeat(32001),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("too long");
    }
  });
});

describe("sendChatSchema", () => {
  const validMessage = { role: "user" as const, content: "Hello" };

  it("accepts valid single user message", () => {
    const result = sendChatSchema.safeParse({
      messages: [validMessage],
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid multi-message conversation", () => {
    const result = sendChatSchema.safeParse({
      messages: [
        { role: "system", content: "You are helpful." },
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi!" },
        { role: "user", content: "How are you?" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty messages array", () => {
    const result = sendChatSchema.safeParse({
      messages: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain(
        "At least one message required",
      );
    }
  });

  it("rejects over 100 messages", () => {
    const messages = Array.from({ length: 101 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      content: `Message ${i}`,
    }));
    const result = sendChatSchema.safeParse({ messages });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("Too many messages");
    }
  });

  it("strips unknown fields", () => {
    const result = sendChatSchema.safeParse({
      messages: [validMessage],
      unknownField: "should be ignored",
    });
    expect(result.success).toBe(true);
  });
});
