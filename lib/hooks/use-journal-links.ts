"use client";

import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { JournalLinkType } from "@/lib/db/types";

interface EnrichedLink {
  id: string;
  link_type: JournalLinkType;
  link_id: string;
  name: string;
  created_at: string;
}

interface LinksResponse {
  links: EnrichedLink[];
}

export function useJournalLinks(entryId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<LinksResponse>(
    entryId ? `/api/journal/${entryId}/links` : null,
    fetcher,
  );

  return {
    links: data?.links ?? [],
    error,
    isLoading,
    mutate,
  };
}

export async function addLink(
  entryId: string,
  linkType: JournalLinkType,
  linkId: string,
): Promise<void> {
  const res = await fetch(`/api/journal/${entryId}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ link_type: linkType, link_id: linkId }),
  });
  if (!res.ok) {
    throw new Error("Failed to add link");
  }
}

export async function removeLink(
  entryId: string,
  linkId: string,
): Promise<void> {
  const res = await fetch(
    `/api/journal/${entryId}/links?link_id=${linkId}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    throw new Error("Failed to remove link");
  }
}
