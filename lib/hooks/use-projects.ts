import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";
import type { Project, ProjectSection, ProjectStatus } from "@/lib/db/types";

export function useProjects(filters?: { section?: ProjectSection; status?: ProjectStatus }) {
  const params = new URLSearchParams();
  if (filters?.section) params.set("section", filters.section);
  if (filters?.status) params.set("status", filters.status);

  const queryString = params.toString();
  const key = queryString ? `/api/projects?${queryString}` : "/api/projects";

  const { data, error, isLoading, mutate } = useSWR<{ projects: Project[] }>(
    key,
    fetcher
  );

  return {
    projects: data?.projects ?? [],
    error,
    isLoading,
    mutate,
  };
}
