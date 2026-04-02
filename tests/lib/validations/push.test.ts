import { describe, it, expect } from "vitest";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@/lib/validations/push";

describe("pushSubscribeSchema", () => {
  it("accepts valid subscription data", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfWRk",
      auth: "tBHItJI5svbpC7jW9AB3BA",
      user_agent: "Mozilla/5.0",
    });
    expect(result.success).toBe(true);
  });

  it("accepts null user_agent", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      p256dh: "BNcRdreALRFXTkOOUHK1",
      auth: "tBHItJI5svbpC7",
      user_agent: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts missing user_agent", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      p256dh: "BNcRdreALRFXTkOOUHK1",
      auth: "tBHItJI5svbpC7",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid endpoint URL", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "not-a-url",
      p256dh: "key",
      auth: "auth",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty p256dh", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      p256dh: "",
      auth: "tBHItJI5svbpC7",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty auth", () => {
    const result = pushSubscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
      p256dh: "BNcRdreALRFXTkOOUHK1",
      auth: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing endpoint", () => {
    const result = pushSubscribeSchema.safeParse({
      p256dh: "key",
      auth: "auth",
    });
    expect(result.success).toBe(false);
  });
});

describe("pushUnsubscribeSchema", () => {
  it("accepts valid endpoint", () => {
    const result = pushUnsubscribeSchema.safeParse({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid endpoint URL", () => {
    const result = pushUnsubscribeSchema.safeParse({
      endpoint: "not-a-url",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing endpoint", () => {
    const result = pushUnsubscribeSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
