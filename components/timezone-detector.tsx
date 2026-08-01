"use client";

import { useUserTimeZone } from "@/lib/hooks/use-profile-preferences";
import { useTimezoneDetection } from "@/lib/hooks/use-timezone-detection";

export function TimezoneDetector() {
  const { timeZone, setUserTimeZone } = useUserTimeZone();
  useTimezoneDetection(
    timeZone.status === "resolved" ? timeZone.value : null,
    setUserTimeZone,
  );
  return null;
}
