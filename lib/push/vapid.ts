/**
 * VAPID (Voluntary Application Server Identification) configuration.
 * Public key is exposed to the client for PushManager.subscribe().
 * Private key is server-only for web-push sendNotification().
 */

/** Public key for client-side PushManager.subscribe() — safe to expose */
export function getVapidPublicKey(): string {
  const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!key) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set");
  return key;
}

/** Server-only: full VAPID details for web-push sendNotification */
export function getVapidDetails() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) {
    throw new Error("VAPID keys are not configured");
  }
  return {
    subject: "mailto:notifications@betterr.me",
    publicKey,
    privateKey,
  };
}

/**
 * Convert a URL-safe base64 VAPID public key to Uint8Array
 * for use with PushManager.subscribe({ applicationServerKey }).
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  // Use Buffer.from for SSR safety (window.atob crashes in Node.js)
  const rawData =
    typeof window !== "undefined"
      ? window.atob(base64)
      : Buffer.from(base64, "base64").toString("binary");
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
