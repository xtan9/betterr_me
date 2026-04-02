import { describe, it } from "vitest";

describe("vapid", () => {
  it.todo("getVapidPublicKey returns the public key from env");
  it.todo("getVapidPublicKey throws when env var is not set");
  it.todo("getVapidDetails returns subject, publicKey, and privateKey");
  it.todo("getVapidDetails throws when keys are not configured");
  it.todo("urlBase64ToUint8Array converts URL-safe base64 to Uint8Array");
});
