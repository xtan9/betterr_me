"use client";

import { useEffect, useRef } from "react";

/**
 * Hook that detects the user's IANA timezone from the browser and
 * saves it to their profile if not already set.
 *
 * Should be called once in a root layout client component.
 * Uses localStorage flag to prevent repeated API calls.
 */
export function useTimezoneDetection(profileTimezone: string | null | undefined) {
  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    if (profileTimezone) return; // Already set, nothing to do

    // Check localStorage to avoid repeated calls across page navigations
    try {
      const flag = localStorage.getItem("betterrme_tz_detected");
      if (flag) return;
    } catch {
      // localStorage unavailable (Safari private browsing, sandboxed iframes)
    }

    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!detectedTimezone) return;

    hasRun.current = true;

    fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: detectedTimezone }),
    })
      .then((res) => {
        if (res.ok) {
          try {
            localStorage.setItem("betterrme_tz_detected", "1");
          } catch {
            // localStorage unavailable — will retry next load but that's acceptable
          }
        }
      })
      .catch((err) => {
        console.error("Timezone detection failed:", err);
        // Will retry on next page load since localStorage flag wasn't set
      });
  }, [profileTimezone]);
}
