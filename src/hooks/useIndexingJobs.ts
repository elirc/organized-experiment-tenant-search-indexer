"use client";

/**
 * This file owns operational indexing-job reads and admin mutations.
 * `src/app/indexing-jobs/page.tsx` calls it.
 * It calls the browser fetch client and invalidates search/job caches after administrative actions.
 * A junior engineer would likely treat rebuilds as fire-and-forget and never refresh the operational view.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/http/client";

export function useIndexingJobs() {
  return useQuery({
    queryKey: ["indexing-jobs"],
    queryFn: () => apiFetch("/api/indexing-jobs")
  });
}

export function useRequestRebuild() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { entityTypes: Array<"TICKET" | "DIRECTORY_USER"> }) =>
      apiFetch("/api/indexing-jobs/rebuild", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["indexing-jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["search"] })
      ]);
    }
  });
}

export function useRunPendingJobs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { limit: number }) =>
      apiFetch("/api/indexing-jobs/run-pending", {
        method: "POST",
        body: JSON.stringify(payload)
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["indexing-jobs"] }),
        queryClient.invalidateQueries({ queryKey: ["search"] })
      ]);
    }
  });
}
