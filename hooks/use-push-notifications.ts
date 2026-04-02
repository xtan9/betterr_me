"use client";

import { useState, useEffect, useCallback } from "react";
import { urlBase64ToUint8Array } from "@/lib/push/vapid";

interface UsePushNotificationsReturn {
  /** Current browser notification permission state */
  permission: NotificationPermission;
  /** Whether the current browser/device has an active push subscription */
  isSubscribed: boolean;
  /** Whether an async operation (subscribe/unsubscribe) is in progress */
  isLoading: boolean;
  /** Whether the browser supports push notifications */
  isSupported: boolean;
  /** Request permission, register SW, create subscription, and POST to /api/push/subscribe */
  subscribe: () => Promise<void>;
  /** Remove subscription from push manager and POST to /api/push/unsubscribe */
  unsubscribe: () => Promise<void>;
  /** Show a test notification via the service worker (no server round-trip) */
  sendTest: () => Promise<void>;
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupported, setIsSupported] = useState(false);

  // On mount: check browser support, current permission, and existing subscription
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !("Notification" in window) ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      setIsLoading(false);
      return;
    }

    setIsSupported(true);
    setPermission(Notification.permission);

    checkExistingSubscription().then((sub) => {
      setIsSubscribed(!!sub);
      setIsLoading(false);
    });
  }, []);

  const subscribe = useCallback(async () => {
    if (!isSupported) return;
    setIsLoading(true);

    try {
      // 1. Request notification permission
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") {
        setIsLoading(false);
        return;
      }

      // 2. Register service worker
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
      await navigator.serviceWorker.ready;

      // 3. Subscribe to push manager with VAPID public key
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error("VAPID public key is not configured");
      }

      const pushSubscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      // 4. Extract keys and send to API
      const p256dhKey = pushSubscription.getKey("p256dh");
      const authKey = pushSubscription.getKey("auth");

      if (!p256dhKey || !authKey) {
        throw new Error("Push subscription is missing encryption keys");
      }

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: pushSubscription.endpoint,
          p256dh: btoa(String.fromCharCode(...new Uint8Array(p256dhKey))),
          auth: btoa(String.fromCharCode(...new Uint8Array(authKey))),
          user_agent: navigator.userAgent,
        }),
      });

      if (!res.ok) {
        throw new Error(`Subscribe failed: ${res.status}`);
      }

      setIsSubscribed(true);
    } catch (error) {
      console.error("Failed to subscribe to push notifications:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return;
    setIsLoading(true);

    try {
      const registration =
        await navigator.serviceWorker.getRegistration("/sw.js");
      if (!registration) {
        setIsSubscribed(false);
        setIsLoading(false);
        return;
      }

      const pushSubscription =
        await registration.pushManager.getSubscription();
      if (pushSubscription) {
        const endpoint = pushSubscription.endpoint;

        // Unsubscribe from push manager
        await pushSubscription.unsubscribe();

        // Remove from server
        const res = await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });

        if (!res.ok) {
          throw new Error(`Unsubscribe failed: ${res.status}`);
        }
      }

      setIsSubscribed(false);
    } catch (error) {
      console.error("Failed to unsubscribe from push notifications:", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  const sendTest = useCallback(async () => {
    const registration =
      await navigator.serviceWorker.getRegistration("/sw.js");
    if (!registration) {
      throw new Error("Service worker not registered");
    }

    await registration.showNotification("BetterR.Me", {
      body: "Push notifications are working!",
      icon: "/icon-192.png",
      data: { url: "/dashboard/settings" },
    });
  }, []);

  return {
    permission,
    isSubscribed,
    isLoading,
    isSupported,
    subscribe,
    unsubscribe,
    sendTest,
  };
}

async function checkExistingSubscription(): Promise<PushSubscription | null> {
  try {
    const registration =
      await navigator.serviceWorker.getRegistration("/sw.js");
    if (!registration) return null;
    return registration.pushManager.getSubscription();
  } catch (error) {
    console.error("Failed to check existing push subscription:", error);
    return null;
  }
}
