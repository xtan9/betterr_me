"use client";

import { useUserTimeZone } from "@/lib/hooks/use-profile-preferences";
import { useTimezoneDetection } from "@/lib/hooks/use-timezone-detection";

export function TimezoneDetector() {
  const { status, timeZone, setUserTimeZone } = useUserTimeZone();
  useTimezoneDetection(
    status === "available" ? timeZone : undefined,
    setUserTimeZone,
  );
  return null;
}
