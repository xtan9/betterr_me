"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type {
  HouseholdMemberWithProfile,
  HouseholdInvitation,
  ViewMode,
} from "@/lib/db/types";

interface HouseholdResponse {
  household_id: string;
  user_id: string;
  role: "owner" | "member";
  members: HouseholdMemberWithProfile[];
  invitations: HouseholdInvitation[];
}

/**
 * SWR hook for household data with view mode state.
 *
 * View mode state lives here so all money pages sharing the same
 * useHousehold() call can pass viewMode to their data hooks.
 */
export function useHousehold() {
  const { data, error, mutate } = useSWR<HouseholdResponse>(
    "/api/money/household",
    fetcher
  );
  const [viewMode, setViewMode] = useState<ViewMode>("mine");

  const isLoading = !data && !error;
  const isMultiMember = (data?.members?.length ?? 0) > 1;

  return {
    householdId: data?.household_id ?? null,
    userId: data?.user_id ?? null,
    members: data?.members ?? [],
    invitations: data?.invitations ?? [],
    isMultiMember,
    isOwner: data?.role === "owner",
    isLoading,
    error,
    mutate,
    viewMode,
    setViewMode,
  };
}
