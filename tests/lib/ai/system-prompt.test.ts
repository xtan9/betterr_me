import { describe, it, expect } from "vitest";
import { buildIdentityMessages } from "@/lib/ai/system-prompt";

describe("buildIdentityMessages", () => {
  const params = { date: "2026-04-10", timezone: "America/Toronto" };

  it("returns exactly 2 messages: user then assistant", () => {
    const messages = buildIdentityMessages(params);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("user");
    expect(messages[1].role).toBe("assistant");
  });

  it("uses correct content structure with type: text", () => {
    const messages = buildIdentityMessages(params);
    for (const msg of messages) {
      expect(msg.content).toEqual([
        expect.objectContaining({ type: "text", text: expect.any(String) }),
      ]);
    }
  });

  it("includes date and timezone in assistant message", () => {
    const messages = buildIdentityMessages(params);
    const text = (messages[1].content as { type: string; text: string }[])[0].text;
    expect(text).toContain("2026-04-10");
    expect(text).toContain("America/Toronto");
  });

  it("includes key identity and behavioral instructions", () => {
    const messages = buildIdentityMessages(params);
    const text = (messages[1].content as { type: string; text: string }[])[0].text;
    expect(text).toContain("BetterR.Me");
    expect(text).toContain("confirmation");
    expect(text).toContain("destructive");
  });
});
