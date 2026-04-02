import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Must be tested by mocking env vars since getVapidPublicKey/getVapidDetails read process.env
describe("vapid", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("getVapidPublicKey", () => {
    it("returns the public key from env", async () => {
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public-key-123";
      const { getVapidPublicKey } = await import("@/lib/push/vapid");
      expect(getVapidPublicKey()).toBe("test-public-key-123");
    });

    it("throws when NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set", async () => {
      delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      const { getVapidPublicKey } = await import("@/lib/push/vapid");
      expect(() => getVapidPublicKey()).toThrow("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set");
    });
  });

  describe("getVapidDetails", () => {
    it("returns subject, publicKey, and privateKey", async () => {
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "pub-key";
      process.env.VAPID_PRIVATE_KEY = "priv-key";
      const { getVapidDetails } = await import("@/lib/push/vapid");
      const details = getVapidDetails();
      expect(details).toEqual({
        subject: "mailto:notifications@betterr.me",
        publicKey: "pub-key",
        privateKey: "priv-key",
      });
    });

    it("throws when keys are not configured", async () => {
      delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
      const { getVapidDetails } = await import("@/lib/push/vapid");
      expect(() => getVapidDetails()).toThrow("VAPID keys are not configured");
    });
  });

  describe("urlBase64ToUint8Array", () => {
    it("converts a URL-safe base64 string to Uint8Array", async () => {
      const { urlBase64ToUint8Array } = await import("@/lib/push/vapid");
      // "SGVsbG8" is URL-safe base64 for "Hello"
      const result = urlBase64ToUint8Array("SGVsbG8");
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(5);
      expect(String.fromCharCode(...result)).toBe("Hello");
    });

    it("handles padding correctly", async () => {
      const { urlBase64ToUint8Array } = await import("@/lib/push/vapid");
      // "YQ" is base64 for "a" (needs == padding)
      const result = urlBase64ToUint8Array("YQ");
      expect(String.fromCharCode(...result)).toBe("a");
    });
  });
});
