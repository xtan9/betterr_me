"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import { useTimezoneDetection } from "@/lib/hooks/use-timezone-detection";

interface ProfileResponse {
  profile: {
    timezone: string | null;
  };
}

export function TimezoneDetector() {
  const { data } = useSWR<ProfileResponse>("/api/profile", fetcher);
  useTimezoneDetection(data?.profile?.timezone);
  return null;
}
