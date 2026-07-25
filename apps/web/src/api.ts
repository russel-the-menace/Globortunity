import type { Filters, JobResponse, Source, Stats } from "./types";

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    ...(signal ? { signal } : {}),
  });
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json() as Promise<T>;
}

export async function fetchJobs(filters: Filters, signal?: AbortSignal): Promise<JobResponse> {
  const params = new URLSearchParams({ page: String(filters.page), limit: "20" });
  if (filters.query) params.set("query", filters.query);
  if (filters.location) params.set("location", filters.location);
  if (filters.remoteScope) params.set("remoteScope", filters.remoteScope);
  if (filters.source) params.set("source", filters.source);
  return getJson<JobResponse>(`/api/jobs?${params}`, signal);
}

export const fetchStats = (signal?: AbortSignal) => getJson<Stats>("/api/stats", signal);
export const fetchSources = async (signal?: AbortSignal) =>
  (await getJson<{ items: Source[] }>("/api/sources", signal)).items;
