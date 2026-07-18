"use client";

/**
 * This file owns search-page API access and mutation-free query state.
 * `src/app/search/page.tsx` calls it.
 * It calls the browser fetch client in `src/lib/http/client.ts`.
 * A junior engineer would likely build query strings by hand in the component and make caching keys drift from the actual request.
 */
import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/http/client";

type SearchParams = {
  query: string;
  entityType?: string;
  status?: string;
  department?: string;
  sortBy: "relevance" | "updatedAt";
  sortDirection: "asc" | "desc";
  page: number;
  pageSize: number;
};

export function useSearch(params: SearchParams) {
  return useQuery({
    queryKey: ["search", params],
    queryFn: async () => {
      const query = new URLSearchParams(
        Object.entries(params)
          .filter(([, value]) => value !== undefined && value !== "")
          .map(([key, value]) => [key, String(value)])
      );

      return apiFetch<{
        items: Array<{
          entityId: string;
          entityType: string;
          title: string;
          body: string;
          filters: Record<string, string>;
          relevance: number;
        }>;
        total: number;
        indexState: {
          activeGeneration: number;
          rebuildingGeneration: number | null;
          pendingEventCount: number;
          isStale: boolean;
        };
      }>(`/api/search?${query.toString()}`);
    },
    enabled: params.query.trim().length > 0
  });
}
